/**
 * Mete en la base los datos de un volcado JSON.
 *
 *   npm run db:cargar                                      (muestra que haria)
 *   npm run db:cargar -- --archivo storage/volcados/volcado-...json --aplicar
 *
 * Su pareja es volcar-datos.ts.
 *
 * SE NIEGA A CORRER SOBRE UNA BASE CON DATOS
 *
 * Cargar encima de lo que ya hay no mezcla dos versiones: deja una base donde
 * nadie puede saber que fila es de cual. Y a diferencia de casi todo lo demas
 * en este sistema, eso no se deshace. Hay que vaciar el destino a conciencia
 * primero, con npm run db:vaciar.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { cargarEnv } from './entorno';
import { prisma } from '../src/lib/db/prisma';

/**
 * Las fechas viajan como texto en JSON; Prisma las quiere como Date.
 *
 * La lista sale de buscar DateTime en el esquema. Si se agrega una columna de
 * fecha y no se agrega aqui, la carga falla con un error de tipo en esa tabla,
 * que es mejor que guardar la fecha como texto y descubrirlo meses despues.
 */
const CAMPOS_FECHA = new Set([
  'abiertaEn',
  'aceptadoEn',
  'actualizadaEn',
  'asignadoEn',
  'bloqueadoHasta',
  'cerradoEn',
  'creadaEn',
  'createdAt',
  'empaquetadoEn',
  'entroEn',
  'enviadaEn',
  'expiraEn',
  'fechaFactura',
  'fechaFin',
  'fechaInicio',
  'gpsRevisadoEn',
  'llegoEn',
  'rechazadaEn',
  'recibidoEn',
  'respondidaEn',
  'resueltoEn',
  'revisadaEn',
  'salioEn',
  'sincronizadoEn',
  'timestamp',
  'tomadaEn',
  'ultimoUso',
  'updatedAt',
  'usadaEn',
  'vencimientoRtv',
  'vencimientoSeguro',
  'verificadoEn',
]);

function revivirFechas<T extends Record<string, unknown>>(fila: T): T {
  const salida: Record<string, unknown> = { ...fila };
  for (const [clave, valor] of Object.entries(salida)) {
    if (CAMPOS_FECHA.has(clave) && typeof valor === 'string') {
      salida[clave] = new Date(valor);
    }
  }
  return salida as T;
}

export interface ResultadoCarga {
  archivo: string;
  totales: Record<string, number>;
}

/**
 * Carga un volcado en la base a la que apunte DATABASE_URL.
 *
 * El orden de las tablas respeta las llaves foraneas: cada una va despues de
 * aquellas de las que depende.
 */
export async function cargarDesdeArchivo(
  ruta: string,
  opciones: { aplicar: boolean; silencioso?: boolean } = { aplicar: false },
): Promise<ResultadoCarga> {
  const crudo = await readFile(ruta, 'utf8').catch(() => {
    throw new Error(`No se encontro ${ruta}.`);
  });
  const datos = JSON.parse(crudo) as Record<string, unknown>;
  const registrar = (t: string) => {
    if (!opciones.silencioso) console.log(t);
  };

  if (opciones.aplicar) {
    const yaHay =
      (await prisma.cajero.count()) +
      (await prisma.chofer.count()) +
      (await prisma.pedido.count()) +
      (await prisma.cliente.count());
    if (yaHay > 0) {
      throw new Error(
        `La base de destino ya tiene ${yaHay} registro(s). Cargar encima deja una base ` +
          'donde no se puede distinguir que fila es de cual. Vacie el destino primero ' +
          'con npm run db:vaciar.',
      );
    }
  }

  const plan: Array<[string, string, (filas: never[]) => Promise<unknown>]> = [
    ['cajeros', 'usuarios', (f) => prisma.cajero.createMany({ data: f })],
    ['choferes', 'repartidores', (f) => prisma.chofer.createMany({ data: f })],
    ['motocicletas', 'motos', (f) => prisma.motocicleta.createMany({ data: f })],
    ['asignaciones', 'asignaciones de moto', (f) => prisma.asignacionMoto.createMany({ data: f })],
    ['gastos', 'gastos de flota', (f) => prisma.registroMantenimiento.createMany({ data: f })],
    ['clientes', 'clientes', (f) => prisma.cliente.createMany({ data: f })],
    ['telefonos', 'telefonos de cliente', (f) => prisma.telefonoCliente.createMany({ data: f })],
    [
      'solicitudes',
      'solicitudes de ubicacion',
      (f) => prisma.solicitudUbicacion.createMany({ data: f }),
    ],
    ['ubicaciones', 'ubicaciones', (f) => prisma.ubicacionCliente.createMany({ data: f })],
    ['mensajes', 'mensajes de WhatsApp', (f) => prisma.mensajeUbicacion.createMany({ data: f })],
    ['pedidos', 'pedidos', (f) => prisma.pedido.createMany({ data: f })],
    ['eventos', 'eventos de auditoria', (f) => prisma.eventoAuditoria.createMany({ data: f })],
    // Las sesiones NO se cargan: son credenciales vivas y no cuesta nada
    // volver a entrar con el PIN. Cargarlas solo alargaria su vida util.
  ];

  const totales: Record<string, number> = {};
  for (const [clave, etiqueta, insertar] of plan) {
    const filas = ((datos[clave] as unknown[]) ?? []).map((f) =>
      revivirFechas(f as Record<string, unknown>),
    );
    totales[clave] = filas.length;
    registrar(`  ${etiqueta.padEnd(26)} ${String(filas.length).padStart(6)} fila(s)`);
    if (opciones.aplicar && filas.length > 0) {
      await insertar(filas as never[]);
    }
  }

  return { archivo: ruta, totales };
}

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

cargarEnv();

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const archivo = argumento('archivo');
  if (!archivo) {
    console.log('Falta --archivo. Los volcados estan en storage/volcados/.');
    process.exitCode = 1;
    return;
  }
  const ruta = path.resolve(archivo);
  const destino = process.env.DATABASE_URL ?? '';

  console.log(`Archivo: ${ruta}`);
  console.log(`Destino: ${destino.replace(/:[^:@/]+@/, ':****@')}\n`);

  await cargarDesdeArchivo(ruta, { aplicar });

  if (!aplicar) {
    console.log('\nNo se escribio nada. Repita con --aplicar.');
    return;
  }

  console.log('\nCargado. Comprobacion:');
  console.log(`  usuarios:     ${await prisma.cajero.count()}`);
  console.log(`  repartidores: ${await prisma.chofer.count()}`);
  console.log(`  motos:        ${await prisma.motocicleta.count()}`);
  console.log(`  clientes:     ${await prisma.cliente.count()}`);
  console.log(`  pedidos:      ${await prisma.pedido.count()}`);
  console.log(`  eventos:      ${await prisma.eventoAuditoria.count()}`);
}

// Solo corre como programa si lo invocaron directamente, no al importarlo.
if (process.argv[1] && path.resolve(process.argv[1]).includes('cargar-volcado')) {
  main()
    .catch((e) => {
      console.error(`\nFALLO: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
