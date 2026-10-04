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

import { prisma } from '@/lib/db/prisma';
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
  /** En colones con decimales, tal como lo tiene el POS. */
  total?: number | null;
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
 * En que punto va el pedido, para la pantalla del cliente.
 *
 * Se mira de atras hacia adelante: la marca mas avanzada manda. Hoy
 * empaquetado y asignacion vienen siempre vacias porque nadie las usa en el
 * POS, asi que en la practica un pedido salta de RECIBIDO a EN_CAMINO. El dia
 * que empiecen a marcarlas, esto se afina solo.
 */
export function estadoDelPedido(p: {
  cancelado?: boolean;
  llegoEn: Date | null;
  salioEn: Date | null;
  asignadoEn: Date | null;
  empaquetadoEn: Date | null;
  cerradoEn: Date | null;
}): string {
  if (p.cancelado) return 'CANCELADO';
  if (p.llegoEn) return 'ENTREGADO';
  if (p.salioEn) return 'EN_CAMINO';
  if (p.asignadoEn) return 'ASIGNADO';
  if (p.empaquetadoEn) return 'EN_COCINA';
  // Un pedido cerrado sin marca de llegada es uno que se recogio en el local
  // o que el cajero cerro sin marcar nada.
  if (p.cerradoEn) return 'ENTREGADO';
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
        estado: estadoDelPedido({ cancelado: crudo.cancelado, ...marcas }),
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
