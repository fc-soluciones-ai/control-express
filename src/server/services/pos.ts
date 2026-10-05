/**
 * Los pedidos que manda el agente instalado en el servidor del local.
 *
 * COMO LLEGAN
 *
 * Soft Restaurant corre en PZLE-SVR-02, en el local, y esta aplicacion en la
 * nube. No hay VPN entre los dos, y abrir el SQL Server a internet seria
 * dejar la contabilidad del negocio al alcance del primero que escanee esa
 * direccion. Asi que el que viaja es un agente: corre alla, lee la base con la
 * cuenta de Windows de esa maquina y manda los pedidos para aca por HTTPS.
 *
 * LO QUE LLEGA ES UNA COPIA
 *
 * El pedido nace y muere en el POS. Esta tabla es un reflejo. Si las dos
 * difieren, manda el POS, y por eso cada envio reemplaza lo que haya.
 *
 * SE LIGA POR LA CLAVE, NO POR EL NOMBRE
 *
 * El POS manda idclientedomicilio, que es exactamente la misma clave que
 * guarda Cliente. No hay que cruzar nombres parecidos ni adivinar: o calza o
 * no calza. Lo mismo con el repartidor, por su codigo de mesero.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  calidadDeDireccion,
  esCelular,
  esTelefonoCR,
  estadoDelCliente,
  juntarDireccion,
  leerTelefono,
  mejorDireccion,
  nombreBuscable,
  type TelefonoLeido,
} from '@/lib/clientes/normalizar';
import { rangoDiaOperativo } from '@/lib/fechas';
import { aCentimos } from '@/lib/money/money';
import { ErrorNegocio } from '@/server/errores';

/**
 * Cuanto puede desfasarse el reloj del servidor del local.
 *
 * El agente firma la hora junto con el contenido. Sin esta ventana, alguien
 * que grabe un envio podria repetirlo manana y resucitar pedidos viejos.
 */
const VENTANA_SEGUNDOS = 300;

/**
 * Comprueba que el envio lo hizo nuestro agente.
 *
 * Misma disciplina que el webhook de WhatsApp: se firma el cuerpo CRUDO con
 * HMAC-SHA256 y se compara en tiempo constante. La diferencia es que aqui la
 * firma incluye la hora, porque el agente la controla y asi se puede rechazar
 * un envio repetido.
 */
export function envioValido(
  cuerpoCrudo: string,
  firma: string | null,
  hora: string | null,
): boolean {
  const secreto = process.env.POS_AGENTE_SECRETO;
  if (!secreto || !firma || !hora) return false;

  const momento = Number(hora);
  if (!Number.isFinite(momento)) return false;
  const ahora = Math.floor(Date.now() / 1000);
  if (Math.abs(ahora - momento) > VENTANA_SEGUNDOS) return false;

  const esperada = createHmac('sha256', secreto).update(`${hora}.${cuerpoCrudo}`, 'utf8').digest();
  let recibida: Buffer;
  try {
    recibida = Buffer.from(firma, 'hex');
  } catch {
    return false;
  }
  if (recibida.length !== esperada.length) return false;
  return timingSafeEqual(recibida, esperada);
}

// -----------------------------------------------------------------------------
// Lo que manda el agente
// -----------------------------------------------------------------------------

export interface PedidoDelPos {
  folio: string;
  serieFolio?: string | null;
  claveCliente?: string | null;
  idDireccion?: string | null;
  telefonoUsado?: string | null;
  idMesero?: string | null;
  /** Fechas en ISO. Las que el POS no tiene llegan nulas. */
  entroEn: string;
  empaquetadoEn?: string | null;
  asignadoEn?: string | null;
  salioEn?: string | null;
  llegoEn?: string | null;
  cerradoEn?: string | null;
  esADomicilio?: boolean;
  cancelado?: boolean;
  /**
   * De cual de las dos tablas del POS salio.
   *
   * true  = dbo.tempcheques, la cuenta sigue ABIERTA. El pedido esta vivo.
   * false = dbo.cheques, la cuenta ya se cerro con el turno. Esta liquidado.
   *
   * Opcional para no romper a un agente viejo que todavia no lo mande; sin el
   * se asume false, que es lo que hacia el agente de antes.
   */
  abierta?: boolean;
  /** El bit `pagado` del POS. Es lo mas parecido a "ya llego" que hay. */
  pagado?: boolean;
  /** En colones con decimales, tal como lo tiene el POS. */
  total?: number | null;
  /** El desglose de pago, que es lo que durante anos salio del Excel. */
  efectivo?: number | null;
  tarjeta?: number | null;
  /** La columna "otros" del POS, que en este negocio es SINPE. */
  otros?: number | null;
}

/** La clave del POS: serie y folio juntos. */
export function claveDelPos(pedido: { folio: string; serieFolio?: string | null }): string {
  const serie = (pedido.serieFolio ?? '').trim();
  return serie === '' ? pedido.folio : `${serie}-${pedido.folio}`;
}

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * En que punto va el pedido.
 *
 * LA MARCA DE CIERRE NO SIGNIFICA ENTREGADO
 *
 * Esto antes decia que un pedido con `cierre` puesto estaba entregado, y era
 * falso. Mirando las cuentas abiertas del local se ve lo que pasa de verdad:
 *
 *   folio 197003   entro 19:31:49   salio 19:54:03   cierre 19:54:04
 *   folio 196995   entro 18:37:06   salio 18:42:10   cierre 18:42:11
 *
 * El cierre cae UN SEGUNDO despues de la salida. No es la hora en que llego:
 * es el momento en que el cajero cierra la cuenta y manda la moto. Tomarlo
 * como entrega marcaba el pedido como terminado justo cuando empezaba a
 * viajar, que es exactamente al reves.
 *
 * LA HORA DE LLEGADA TAMPOCO SIRVE
 *
 * Esto tambien usaba `llegoEn`, y el tablero seguia saliendo vacio. Los
 * pedidos de una noche real, leidos de la base:
 *
 *   #196994   entro 18:32:36   salio 18:47:18   "llego" 20:22:12
 *   #196995   entro 18:37:06   salio 18:42:10   "llego" 20:22:17
 *   #196996   entro 18:39:58   salio 20:22:23   "llego" 20:22:27
 *   #197000   entro 19:12:03   salio 19:39:18   "llego" 20:22:39
 *   #197003   entro 19:31:49   salio 19:54:03   "llego" 20:22:43
 *
 * Cinco pedidos que salieron a lo largo de dos horas "llegaron" todos dentro
 * del mismo medio minuto, a las 20:22. Nadie marca la entrega al entregar: el
 * cajero aprieta un boton y marca un monton de golpe. En noventa pedidos
 * medidos salieron solo 28 horas distintas de llegada.
 *
 * Asi que `llegoEn` se guarda, porque es lo que dice el POS, pero NO decide
 * nada. Usarla mataba todos los pedidos de la noche a las 20:22.
 *
 * QUE SI SIRVE
 *
 * - `abierta = false`: el pedido ya paso a dbo.cheques, o sea que el turno se
 *   cerro con el adentro. Terminado, sea como sea que haya terminado.
 * - `pagado`: el POS lo marca cuando se cobra. Para un domicilio, se cobra al
 *   entregar. Es lo mas parecido a "ya llego" que da este POS.
 *
 * NADA DE ESTO ES LA VERDAD
 *
 * Este POS no tiene una hora de entrega de verdad. Lo que hay es una
 * aproximacion: el pedido se muestra hasta que la caja lo cobra o lo cierra.
 * Sirve para lo que importa, que es ver cual lleva mucho rato sin resolverse,
 * y no sirve para medir al repartidor.
 *
 * La hora real va a existir el dia que el repartidor marque "entregado" en su
 * telefono. Mientras tanto, conviene que quien mire el tablero sepa que el
 * reloj se detiene cuando la caja cobra, no cuando el cliente abre la puerta.
 */
export function estadoDelPedido(p: {
  cancelado?: boolean;
  abierta?: boolean;
  pagado?: boolean;
  llegoEn: Date | null;
  salioEn: Date | null;
  asignadoEn: Date | null;
  empaquetadoEn: Date | null;
  cerradoEn: Date | null;
}): string {
  if (p.cancelado) return 'CANCELADO';

  // Un agente viejo no manda `abierta`. Para el, todo venia de dbo.cheques.
  const abierta = p.abierta ?? false;
  if (!abierta) return 'ENTREGADO';

  // Ojo: `llegoEn` NO entra aqui, a proposito. Ver el comentario de arriba.
  if (p.pagado) return 'ENTREGADO';
  if (p.salioEn) return 'EN_CAMINO';
  if (p.asignadoEn) return 'ASIGNADO';
  if (p.empaquetadoEn) return 'EN_COCINA';
  return 'RECIBIDO';
}

export interface ResultadoDeSincronizacion {
  recibidos: number;
  nuevos: number;
  actualizados: number;
  ligadosACliente: number;
  ligadosARepartidor: number;
  rechazados: Array<{ folio: string; motivo: string }>;
}

/**
 * Guarda un lote de pedidos.
 *
 * Nunca lanza por un pedido malo: el agente reintenta el lote entero, y si uno
 * tumbara la llamada los buenos entrarian una y otra vez. Lo que no se pudo
 * guardar vuelve en `rechazados` para que quede en el registro del agente.
 */
export async function sincronizarPedidos(
  pedidos: PedidoDelPos[],
): Promise<ResultadoDeSincronizacion> {
  if (!Array.isArray(pedidos)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El envio no trae una lista de pedidos.');
  }
  if (pedidos.length > 500) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Maximo 500 pedidos por envio.');
  }

  const resultado: ResultadoDeSincronizacion = {
    recibidos: pedidos.length,
    nuevos: 0,
    actualizados: 0,
    ligadosACliente: 0,
    ligadosARepartidor: 0,
    rechazados: [],
  };

  for (const crudo of pedidos) {
    try {
      const entroEn = fecha(crudo.entroEn);
      if (!crudo.folio || !entroEn) {
        resultado.rechazados.push({
          folio: String(crudo.folio ?? '?'),
          motivo: 'sin folio o sin fecha de entrada',
        });
        continue;
      }

      const clave = claveDelPos(crudo);

      // Las dos llaves compartidas con el POS. O calzan o quedan sueltas: no
      // se cruza por nombre, que es como se terminan mezclando dos clientes.
      const claveCliente = (crudo.claveCliente ?? '').trim() || null;
      const cliente = claveCliente
        ? await prisma.cliente.findUnique({ where: { clave: claveCliente }, select: { id: true } })
        : null;

      const idMesero = (crudo.idMesero ?? '').trim() || null;
      const chofer = idMesero
        ? await prisma.chofer.findUnique({
            where: { idMeseroSoftRestaurant: idMesero },
            select: { id: true },
          })
        : null;

      const marcas = {
        empaquetadoEn: fecha(crudo.empaquetadoEn),
        asignadoEn: fecha(crudo.asignadoEn),
        salioEn: fecha(crudo.salioEn),
        llegoEn: fecha(crudo.llegoEn),
        cerradoEn: fecha(crudo.cerradoEn),
      };

      const datos = {
        folio: String(crudo.folio),
        serieFolio: (crudo.serieFolio ?? '').trim() || null,
        claveCliente,
        idDireccion: (crudo.idDireccion ?? '').trim() || null,
        telefonoUsado: (crudo.telefonoUsado ?? '').trim() || null,
        clienteId: cliente?.id ?? null,
        idMesero,
        choferId: chofer?.id ?? null,
        entroEn,
        ...marcas,
        esADomicilio: crudo.esADomicilio ?? false,
        cancelado: crudo.cancelado ?? false,
        // El POS lo manda en colones con decimales; aqui todo el dinero son
        // centimos enteros. Ver lib/money/money.ts.
        total: aCentimos(Number(crudo.total ?? 0)),
        efectivo: aCentimos(Number(crudo.efectivo ?? 0)),
        tarjeta: aCentimos(Number(crudo.tarjeta ?? 0)),
        sinpe: aCentimos(Number(crudo.otros ?? 0)),
        estado: estadoDelPedido({
          cancelado: crudo.cancelado,
          abierta: crudo.abierta,
          pagado: crudo.pagado,
          ...marcas,
        }),
        sincronizadoEn: new Date(),
      };

      const existia = await prisma.pedido.findUnique({
        where: { claveDelPos: clave },
        select: { id: true },
      });
      // El POS manda: cada envio reemplaza lo que hubiera.
      await prisma.pedido.upsert({
        where: { claveDelPos: clave },
        update: datos,
        create: { claveDelPos: clave, ...datos },
      });

      if (existia) resultado.actualizados += 1;
      else resultado.nuevos += 1;
      if (cliente) resultado.ligadosACliente += 1;
      if (chofer) resultado.ligadosARepartidor += 1;
    } catch (error) {
      resultado.rechazados.push({
        folio: String(crudo?.folio ?? '?'),
        motivo: error instanceof Error ? error.message.slice(0, 120) : 'error inesperado',
      });
    }
  }

  return resultado;
}

/** Como va la sincronizacion, para la pantalla. */
export async function estadoDeLaSincronizacion() {
  const [total, ultimo, sinCliente, sinRepartidor, porEstado] = await Promise.all([
    prisma.pedido.count(),
    prisma.pedido.findFirst({ orderBy: { sincronizadoEn: 'desc' }, select: { sincronizadoEn: true } }),
    prisma.pedido.count({ where: { claveCliente: { not: null }, clienteId: null } }),
    prisma.pedido.count({ where: { idMesero: { not: null }, choferId: null } }),
    prisma.pedido.groupBy({ by: ['estado'], _count: { _all: true } }),
  ]);
  return {
    total,
    ultimaSincronizacion: ultimo?.sincronizadoEn ?? null,
    // Pedidos cuyo cliente el POS conoce y nosotros no: falta importar.
    sinClienteLigado: sinCliente,
    sinRepartidorLigado: sinRepartidor,
    porEstado: porEstado.map((f) => ({ estado: f.estado, cuantos: f._count._all })),
  };
}

// -----------------------------------------------------------------------------
// Los clientes, leidos del POS
// -----------------------------------------------------------------------------
//
// EL EXCEL QUEDO ATRAS
//
// La primera carga salio de dos archivos exportados a mano. Al cruzarlos con
// los pedidos reales aparecio el problema: de los 206 clientes que pidieron en
// una semana, 53 no existian en la exportacion. Eran fichas creadas despues.
// Una exportacion es una foto, y la caja crea clientes todos los dias.
//
// Asi que los clientes llegan por el mismo agente que los pedidos, y la lista
// se mantiene sola.
//
// SE RECALCULA TODO AQUI, NO ALLA
//
// El agente manda los campos crudos del POS, tal como estan. Quien decide si
// un telefono sirve, si una direccion alcanza y en que estado queda el cliente
// es esta aplicacion, con la misma libreria que usa la pantalla. Si esa logica
// viviera en el agente, habria dos verdades y la del servidor del local nadie
// la probaria nunca.

export interface ClienteDelPos {
  /** idcliente del POS. Los ceros de adelante son parte de la clave. */
  clave: string;
  nombre?: string | null;
  correo?: string | null;
  /** clientes.direccion, el texto suelto del catalogo. */
  direccionGeneral?: string | null;
  /** Los cinco campos de telefono, tal como vienen. */
  telefonos?: Array<string | null>;
  /** De direccionesdomicilio: la ficha de CASA si existe. */
  iddireccion?: string | null;
  calle?: string | null;
  cruzamiento1?: string | null;
  cruzamiento2?: string | null;
  referencia?: string | null;
  zona?: string | null;
  /** El POS tiene las columnas; hoy estan vacias en las 12.833 direcciones. */
  latitud?: number | null;
  longitud?: number | null;
}

export interface ResultadoDeClientes {
  recibidos: number;
  nuevos: number;
  actualizados: number;
  sinCambio: number;
  listos: number;
  conUbicacionDelPos: number;
  rechazados: Array<{ clave: string; motivo: string }>;
}

/**
 * Guarda un lote de clientes del POS.
 *
 * No pisa lo que una persona ya confirmo: un telefono con verificadoEn puesto
 * se queda, aunque el POS mande otro. Lo que el cliente contesto por WhatsApp
 * vale mas que lo que alguien tecleo en el mostrador.
 */
export async function sincronizarClientes(
  clientes: ClienteDelPos[],
): Promise<ResultadoDeClientes> {
  if (!Array.isArray(clientes)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El envio no trae una lista de clientes.');
  }
  if (clientes.length > 500) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Maximo 500 clientes por envio.');
  }

  const resultado: ResultadoDeClientes = {
    recibidos: clientes.length,
    nuevos: 0,
    actualizados: 0,
    sinCambio: 0,
    listos: 0,
    conUbicacionDelPos: 0,
    rechazados: [],
  };

  for (const crudo of clientes) {
    try {
      const clave = (crudo.clave ?? '').trim();
      if (clave === '') {
        resultado.rechazados.push({ clave: '(vacia)', motivo: 'sin clave' });
        continue;
      }

      const nombre = (crudo.nombre ?? '').trim();

      // Los telefonos, leidos con la misma regla que todo lo demas.
      const leidos: TelefonoLeido[] = [];
      const vistos = new Set<string>();
      for (const valor of crudo.telefonos ?? []) {
        const leido = leerTelefono(valor);
        if (!leido || vistos.has(leido.numero)) continue;
        vistos.add(leido.numero);
        leidos.push(leido);
      }
      // La clave del POS es un telefono en 381 fichas de esta base.
      if (esTelefonoCR(clave) && !vistos.has(clave)) {
        vistos.add(clave);
        leidos.push({ numero: clave, origen: 'CLAVE_DEL_POS', comoVenia: clave });
      }

      const principal =
        leidos.find((t) => t.origen === 'DIRECTO' && esCelular(t.numero)) ??
        leidos.find((t) => t.origen === 'CLAVE_DEL_POS' && esCelular(t.numero)) ??
        leidos.find((t) => t.origen === 'DIRECTO') ??
        leidos.find((t) => esCelular(t.numero)) ??
        leidos[0] ??
        null;

      const direccionDomicilio = juntarDireccion([
        crudo.calle,
        crudo.cruzamiento1,
        crudo.cruzamiento2,
        crudo.referencia,
        crudo.zona,
      ]);
      const direccionTexto = mejorDireccion(
        (crudo.direccionGeneral ?? '').trim(),
        direccionDomicilio,
      );
      const calidadDireccion = calidadDeDireccion(direccionTexto);

      // Un telefono compartido se detecta contra lo que ya hay guardado: el
      // lote no alcanza, porque las dos fichas pueden venir en envios
      // distintos.
      const compartido = principal
        ? (await prisma.cliente.count({
            where: { telefono: principal.numero, clave: { not: clave } },
          })) > 0
        : false;

      const estado = estadoDelCliente({
        nombre,
        telefono: principal?.numero ?? null,
        origenTelefono: principal?.origen ?? null,
        calidadDireccion,
        telefonoCompartido: compartido,
      });
      if (estado === 'LISTO') resultado.listos += 1;

      const datos = {
        nombre,
        nombreBuscable: nombreBuscable(nombre),
        telefono: principal?.numero ?? null,
        esCelular: principal ? esCelular(principal.numero) : false,
        direccionTexto,
        calidadDireccion,
        correo: (crudo.correo ?? '').trim() || null,
        estado,
        telefonoCompartido: compartido,
        origenCarga: 'POS',
      };

      const existia = await prisma.cliente.findUnique({
        where: { clave },
        select: { id: true, nombre: true, telefono: true, direccionTexto: true, estado: true },
      });

      const cliente = existia
        ? await prisma.cliente.update({ where: { clave }, data: datos })
        : await prisma.cliente.create({ data: { clave, ...datos } });

      if (!existia) resultado.nuevos += 1;
      else if (
        existia.nombre === datos.nombre &&
        existia.telefono === datos.telefono &&
        existia.direccionTexto === datos.direccionTexto &&
        existia.estado === datos.estado
      ) {
        resultado.sinCambio += 1;
      } else {
        resultado.actualizados += 1;
      }

      for (const t of leidos) {
        const ya = await prisma.telefonoCliente.findUnique({
          where: { clienteId_numero: { clienteId: cliente.id, numero: t.numero } },
        });
        // Lo que una persona confirmo no se pisa con lo que diga el POS.
        if (ya) continue;
        await prisma.telefonoCliente.create({
          data: {
            clienteId: cliente.id,
            numero: t.numero,
            esCelular: esCelular(t.numero),
            origen: t.origen,
            comoVenia: t.comoVenia.slice(0, 200),
            campo: 'POS',
          },
        });
      }

      // El POS tiene columnas de coordenadas, hoy vacias en las 12.833
      // direcciones. El dia que alguien las llene, entran como una propuesta
      // mas y alguien las acepta, igual que las del cliente.
      const lat = crudo.latitud;
      const lon = crudo.longitud;
      if (typeof lat === 'number' && typeof lon === 'number' && lat !== 0 && lon !== 0) {
        const yaHay = await prisma.ubicacionCliente.count({
          where: { clienteId: cliente.id, origen: 'CAJA', latitud: lat, longitud: lon },
        });
        if (yaHay === 0) {
          await prisma.ubicacionCliente.create({
            data: {
              clienteId: cliente.id,
              latitud: lat,
              longitud: lon,
              origen: 'CAJA',
              estado: 'PROPUESTA',
              nota: 'Venia en el POS',
            },
          });
          resultado.conUbicacionDelPos += 1;
        }
      }
    } catch (error) {
      resultado.rechazados.push({
        clave: String(crudo?.clave ?? '?'),
        motivo: error instanceof Error ? error.message.slice(0, 120) : 'error inesperado',
      });
    }
  }

  return resultado;
}
