/**
 * Carga la base de clientes de la pizzeria desde los dos archivos del POS.
 *
 *   npm run clientes:importar                    (muestra que haria, no escribe)
 *   npm run clientes:importar -- --aplicar
 *
 * Los dos archivos se pasan con --general y --domicilio, o se buscan en la
 * carpeta que diga CLIENTES_DIRECTORIO.
 *
 *   npm run clientes:importar -- --aplicar \
 *     --general "C:/.../clientesPZ2026.xls" \
 *     --domicilio "C:/.../clientes_domicilio PZ2026.xls"
 *
 * QUE HACE CON CADA ARCHIVO
 *
 * El de domicilio es la base real: 10.117 filas con teléfono, correo y la
 * direccion partida en campos. Trae varias filas por cliente, una por
 * direccion (CASA y OFICINA).
 *
 * El general es un resumen del mismo padron: las 9.839 claves son identicas y
 * los nombres coinciden al 100%. Aporta una sola cosa, pero importante: en
 * 1.694 clientes el de domicilio dejo la calle en "1" y el general trae el
 * texto bueno.
 *
 * SE PUEDE CORRER DOS VECES
 *
 * Actualiza por clave y no borra nada. Los telefonos y las ubicaciones ya
 * verificadas a mano no se pisan: lo que una persona confirmo vale mas que lo
 * que diga el archivo del POS.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { prisma } from '../src/lib/db/prisma';
import {
  calidadDeDireccion,
  esCelular,
  estadoDelCliente,
  juntarDireccion,
  leerTelefono,
  mejorDireccion,
  nombreBuscable,
  telefonosEnTexto,
  type TelefonoLeido,
} from '../src/lib/clientes/normalizar';
import { registrarEvento } from '../src/server/services/auditoria';
import type { OrigenTelefono } from '../src/types/enums';

// xlsx se publica como CommonJS; en un script ESM hay que pedirlo asi.
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const APLICAR = process.argv.includes('--aplicar');

/**
 * Cargar unicamente los clientes en estado LISTO.
 *
 * Son los que tienen nombre, un celular propio que no comparten con otra
 * ficha, y una direccion que ya sirve: a esos se les puede escribir por
 * WhatsApp hoy mismo. Los demas entran despues, cuando se les consiga el
 * telefono o se les confirme el que hay.
 */
const SOLO_LISTOS = process.argv.includes('--solo-listos');
const COLUMNAS_TELEFONO = ['telefono', 'telefono2', 'telefono3', 'telefono4', 'telefono5'] as const;

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function rutas(): { general: string; domicilio: string } {
  const base = process.env.CLIENTES_DIRECTORIO ?? '';
  const general = argumento('general') ?? (base ? join(base, 'clientesPZ2026.xls') : '');
  const domicilio =
    argumento('domicilio') ?? (base ? join(base, 'clientes_domicilio PZ2026.xls') : '');
  if (!general || !domicilio) {
    throw new Error(
      'Falta decir donde estan los archivos. Use --general y --domicilio, o ponga ' +
        'CLIENTES_DIRECTORIO en el .env con la carpeta que los contiene.',
    );
  }
  return { general, domicilio };
}

type Fila = Record<string, string | null>;

function leerHoja(ruta: string): Fila[] {
  const libro = XLSX.read(readFileSync(ruta), { type: 'buffer' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  // raw:false para que una clave como 007372 llegue con sus ceros y no como 7372.
  return XLSX.utils.sheet_to_json(hoja, { defval: null, raw: false }) as Fila[];
}

const texto = (valor: string | null | undefined) => (valor ?? '').trim();
/** La clave viene a veces entre comillas, pero los ceros de adelante importan. */
const leerClave = (valor: string | null | undefined) =>
  texto(valor).replace(/^"+|"+$/g, '').trim();

interface ClientePreparado {
  clave: string;
  nombre: string;
  telefonos: TelefonoLeido[];
  /** En que columna estaba cada numero, para poder volver al archivo. */
  campoDe: Map<string, string>;
  direccionGeneral: string;
  direccionDomicilio: string;
  correo: string | null;
  filas: number;
}

/** Arma un registro por cliente juntando las filas de las dos hojas. */
function preparar(general: Fila[], domicilio: Fila[]): ClientePreparado[] {
  const direccionGeneral = new Map<string, string>();
  for (const f of general) direccionGeneral.set(leerClave(f.clave), texto(f.direccion));

  const porClave = new Map<string, Fila[]>();
  for (const f of domicilio) {
    const clave = leerClave(f.clave);
    const lista = porClave.get(clave);
    if (lista) lista.push(f);
    else porClave.set(clave, [f]);
  }

  const preparados: ClientePreparado[] = [];
  for (const [clave, filas] of porClave) {
    // La ficha de CASA manda; si no hay, la primera que aparezca.
    const casa = filas.find((f) => /CASA/i.test(texto(f.iddireccion))) ?? filas[0];
    // No puede pasar (la clave salio de estas mismas filas), pero el tipo no
    // lo sabe y un indice fuera de rango aqui seria un cliente sin datos.
    if (!casa) continue;

    const telefonos: TelefonoLeido[] = [];
    const campoDe = new Map<string, string>();
    const vistos = new Set<string>();
    for (const fila of filas) {
      for (const columna of COLUMNAS_TELEFONO) {
        const leido = leerTelefono(fila[columna]);
        if (!leido || vistos.has(leido.numero)) continue;
        vistos.add(leido.numero);
        telefonos.push(leido);
        campoDe.set(leido.numero, columna);
      }
    }

    // La clave del POS era el telefono del cliente en 381 fichas. Vale como
    // numero, y ademas es el unico que hay en 26 de ellas.
    if (/^[24678]\d{7}$/.test(clave) && !vistos.has(clave)) {
      vistos.add(clave);
      telefonos.push({ numero: clave, origen: 'CLAVE_DEL_POS', comoVenia: clave });
      campoDe.set(clave, 'clave');
    }

    // Ultimo recurso: numeros escritos a mano dentro de la direccion.
    if (telefonos.length === 0) {
      for (const fila of filas) {
        const revuelto = [fila.nombre, fila.calle, fila.referencia, fila.cruzamiento2]
          .map(texto)
          .join(' ');
        for (const numero of telefonosEnTexto(revuelto)) {
          if (vistos.has(numero)) continue;
          vistos.add(numero);
          telefonos.push({
            numero,
            origen: 'ESCONDIDO_DIRECCION',
            comoVenia: revuelto.slice(0, 120),
          });
          campoDe.set(numero, 'direccion');
        }
      }
    }

    preparados.push({
      clave,
      nombre: texto(casa.nombre),
      telefonos,
      campoDe,
      direccionGeneral: direccionGeneral.get(clave) ?? '',
      direccionDomicilio: juntarDireccion([
        casa.calle,
        casa.cruzamiento1,
        casa.cruzamiento2,
        casa.referencia,
        casa.estado,
      ]),
      correo: texto(casa.email) || null,
      filas: filas.length,
    });
  }
  return preparados;
}

/** De todos los numeros de un cliente, cual se usa para escribirle. */
function telefonoPrincipal(telefonos: TelefonoLeido[]): TelefonoLeido | null {
  // Un celular bien escrito es lo unico que sirve para WhatsApp; despues
  // cualquier numero bien escrito; de ultimo, lo reconstruido.
  return (
    telefonos.find((t) => t.origen === 'DIRECTO' && esCelular(t.numero)) ??
    telefonos.find((t) => t.origen === 'CLAVE_DEL_POS' && esCelular(t.numero)) ??
    telefonos.find((t) => t.origen === 'DIRECTO') ??
    telefonos.find((t) => esCelular(t.numero)) ??
    telefonos[0] ??
    null
  );
}

async function main(): Promise<void> {
  const { general, domicilio } = rutas();
  console.log(`General:   ${general}`);
  console.log(`Domicilio: ${domicilio}\n`);

  const filasGeneral = leerHoja(general);
  const filasDomicilio = leerHoja(domicilio);
  console.log(`Leidas ${filasGeneral.length} filas del general y ${filasDomicilio.length} del de domicilio.`);

  const preparados = preparar(filasGeneral, filasDomicilio);
  console.log(`Clientes unicos por clave: ${preparados.length}`);

  // --- Repetidos: se marcan, no se fusionan -------------------------------
  const cuantosPorTelefono = new Map<string, number>();
  const cuantosPorNombre = new Map<string, number>();
  for (const c of preparados) {
    const principal = telefonoPrincipal(c.telefonos);
    if (principal) {
      cuantosPorTelefono.set(principal.numero, (cuantosPorTelefono.get(principal.numero) ?? 0) + 1);
    }
    const buscable = nombreBuscable(c.nombre);
    if (buscable) cuantosPorNombre.set(buscable, (cuantosPorNombre.get(buscable) ?? 0) + 1);
  }

  const resumen = new Map<string, number>();
  const aEscribir = preparados.map((c) => {
    const principal = telefonoPrincipal(c.telefonos);
    const direccionTexto = mejorDireccion(c.direccionGeneral, c.direccionDomicilio);
    const calidad = calidadDeDireccion(direccionTexto);
    const buscable = nombreBuscable(c.nombre);
    const compartido = principal ? (cuantosPorTelefono.get(principal.numero) ?? 0) > 1 : false;
    const estado = estadoDelCliente({
      nombre: c.nombre,
      telefono: principal?.numero ?? null,
      origenTelefono: (principal?.origen as OrigenTelefono | undefined) ?? null,
      calidadDireccion: calidad,
      telefonoCompartido: compartido,
    });
    resumen.set(estado, (resumen.get(estado) ?? 0) + 1);
    return {
      preparado: c,
      principal,
      direccionTexto,
      calidad,
      buscable,
      compartido,
      estado,
      nombreRepetido: buscable ? (cuantosPorNombre.get(buscable) ?? 0) > 1 : false,
    };
  });

  console.log('\nComo queda cada cliente:');
  for (const [estado, cuantos] of [...resumen].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${estado.padEnd(24)} ${String(cuantos).padStart(5)}`);
  }
  const listos = resumen.get('LISTO') ?? 0;
  console.log(
    `\n${listos} clientes listos para pedirles la ubicacion por WhatsApp hoy ` +
      `(${Math.round((listos / preparados.length) * 100)}% de la base).`,
  );

  const seleccion = SOLO_LISTOS ? aEscribir.filter((f) => f.estado === 'LISTO') : aEscribir;
  if (SOLO_LISTOS) {
    console.log(
      `\nSolo los LISTO: se cargan ${seleccion.length} de ${aEscribir.length}. ` +
        `Los otros ${aEscribir.length - seleccion.length} quedan fuera por ahora.`,
    );
  }

  if (!APLICAR) {
    console.log('\nNada se escribio. Repita con --aplicar.');
    return;
  }

  // --- Escritura ------------------------------------------------------------
  const origenCarga = `POS ${new Date().toISOString().slice(0, 10)}`;
  let creados = 0;
  let actualizados = 0;
  let telefonosNuevos = 0;

  for (const fila of seleccion) {
    const { preparado: c } = fila;
    const datos = {
      nombre: c.nombre,
      nombreBuscable: fila.buscable,
      telefono: fila.principal?.numero ?? null,
      esCelular: fila.principal ? esCelular(fila.principal.numero) : false,
      direccionTexto: fila.direccionTexto,
      calidadDireccion: fila.calidad,
      correo: c.correo,
      estado: fila.estado,
      telefonoCompartido: fila.compartido,
      nombreRepetido: fila.nombreRepetido,
      origenCarga,
    };

    const existia = await prisma.cliente.findUnique({ where: { clave: c.clave } });
    const cliente = existia
      ? await prisma.cliente.update({ where: { clave: c.clave }, data: datos })
      : await prisma.cliente.create({ data: { clave: c.clave, ...datos } });
    if (existia) actualizados += 1;
    else creados += 1;

    for (const t of c.telefonos) {
      // Lo que alguien ya confirmo a mano no se pisa con lo que diga el POS.
      const ya = await prisma.telefonoCliente.findUnique({
        where: { clienteId_numero: { clienteId: cliente.id, numero: t.numero } },
      });
      if (ya) continue;
      await prisma.telefonoCliente.create({
        data: {
          clienteId: cliente.id,
          numero: t.numero,
          esCelular: esCelular(t.numero),
          origen: t.origen,
          comoVenia: t.comoVenia.slice(0, 200),
          campo: c.campoDe.get(t.numero) ?? 'telefono',
        },
      });
      telefonosNuevos += 1;
    }

    if ((creados + actualizados) % 500 === 0) {
      console.log(`  ...${creados + actualizados} de ${seleccion.length}`);
    }
  }

  const responsable = await prisma.cajero.findFirst({
    where: { rol: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  if (responsable) {
    await registrarEvento(prisma, {
      tipo: 'CLIENTES_IMPORTADOS',
      cajeroId: responsable.id,
      entidadTipo: 'Cliente',
      entidadId: origenCarga,
      detalle: {
        creados,
        actualizados,
        telefonosNuevos,
        listos,
        total: seleccion.length,
        archivos: [general, domicilio],
      },
    });
  }

  console.log(
    `\nListo: ${creados} clientes nuevos, ${actualizados} actualizados, ` +
      `${telefonosNuevos} telefonos guardados.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
