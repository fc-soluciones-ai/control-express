/**
 * El tablero: que pedidos no han salido todavia, y cuanto llevan esperando.
 *
 * ESTE ES EL PROBLEMA DEL NEGOCIO
 *
 * La pizzeria no pierde plata por el cierre de caja: pierde clientes porque
 * los pedidos llegan tarde. Hasta hoy nadie en el mostrador podia decir
 * cuantos pedidos estaban atrasados en este momento, porque el POS no tiene
 * esa pantalla. Lo unico que habia era la queja del cliente cuando llamaba.
 *
 * EL TABLERO MIDE EL DESPACHO, NO LA ENTREGA
 *
 * Un pedido sale de la lista cuando la moto arranca, no cuando el cliente
 * abre la puerta. Lo pidio asi el negocio y es lo correcto, por dos razones:
 *
 * 1. Es lo que el local CONTROLA. Que una pizza tarde cuarenta minutos en
 *    salir es un problema de cocina, o de que no hay repartidor libre, y eso
 *    se arregla desde el mostrador. Lo que pasa despues, en la calle, no.
 * 2. Es lo unico que se puede MEDIR hoy. Este POS no tiene una hora de
 *    entrega de verdad: `arriborepartidor` se marca en bloque, de a diez
 *    pedidos a la vez, cuando alguien aprieta un boton. La hora de salida, en
 *    cambio, se pone cuando el repartidor toma el pedido, y casi siempre es
 *    real.
 *
 * Asi que el reloj de este tablero responde una sola pregunta: cuanto lleva
 * este cliente esperando a que su pedido siquiera salga. El dia que el
 * repartidor marque la entrega en su telefono, esa sera otra medicion y otra
 * pantalla.
 *
 * DE DONDE SALEN LOS DATOS
 *
 * De la tabla pedidos, que el agente del POS llena cada treinta segundos
 * leyendo la base de Soft Restaurant. No hay Excel, no hay carga manual y no
 * hay nada que exportar: se consulta la base y se pinta.
 *
 * QUE CUENTA COMO "SIN DESPACHAR"
 *
 * Un pedido a domicilio, del dia operativo en curso, sin hora de salida y que
 * no este resuelto. Las cuatro condiciones importan:
 *
 * - A domicilio, porque lo que se come en el local no sale en ninguna moto y
 *   se quedaria en la lista para siempre, en rojo, sin que nadie pueda
 *   sacarlo.
 * - Del dia operativo, por lo mismo: un cheque que quedo abierto el martes no
 *   es un pedido atrasado, es un cheque mal cerrado. Mezclarlos hace que el
 *   tablero deje de servir a los tres dias.
 * - Sin hora de salida, que es la pregunta.
 * - Ni resuelto ni cancelado, para el pedido que se cerro sin que nadie le
 *   pusiera la hora de salida: se cobro en el local, se anulo, o el cajero lo
 *   cerro de otra manera. Sin esto, esos se quedarian pegados arriba del
 *   tablero toda la noche.
 */

import { diaOperativoDe, rangoDiaOperativo } from '@/lib/fechas';
import { minutosDesde, contarPorTramo, type TramoDeEspera } from '@/lib/entregas/espera';
import { prisma } from '@/lib/db/prisma';
import type { EstadoPedido } from '@/types/enums';

/**
 * Tope de filas. Una noche mala de la pizzeria son unos cuarenta pedidos
 * pendientes a la vez; doscientos es holgado y a la vez impide que un error
 * del agente traiga diez mil filas al navegador del mostrador.
 */
const TOPE = 200;

/**
 * Los estados que significan "todavia no ha salido".
 *
 * EN_CAMINO NO esta, a proposito: ese es justamente el que ya se despacho.
 *
 * Va tipado contra EstadoPedido para que agregar un estado nuevo al enum y
 * olvidarse de decidir si cuenta como pendiente no compile.
 */
export const ESTADOS_SIN_DESPACHAR: ReadonlyArray<EstadoPedido> = [
  'RECIBIDO',
  'EN_COCINA',
  'ASIGNADO',
];

export interface PedidoPendiente {
  id: string;
  folio: string;
  estado: string;
  /** Cuando entro al POS. Es el reloj que cuenta para el cliente. */
  entroEn: Date;
  /** Minutos esperando, calculados en el servidor para el primer pintado. */
  minutosEsperando: number;
  cliente: string | null;
  telefono: string | null;
  direccion: string | null;
  repartidor: string | null;
  placa: string | null;
  /** Centimos. Lo que el repartidor tiene que cobrar. */
  total: number;
}

export interface TableroDeEntregas {
  diaOperativo: string;
  /** Hora del servidor al armar la respuesta. El navegador mide contra esta. */
  ahora: Date;
  pendientes: PedidoPendiente[];
  /** Cuantos hay en cada color. */
  porTramo: Record<TramoDeEspera, number>;
  /** Pedidos que ya salieron hoy. Es la cifra que dice si la noche va bien. */
  despachadosHoy: number;
  /** True cuando se alcanzo el tope y la lista esta recortada. */
  recortado: boolean;
  /** Ultima vez que el agente del POS mando algo. Null si nunca. */
  ultimaSincronizacion: Date | null;
}

/**
 * Los pedidos sin despachar, del mas viejo al mas nuevo.
 *
 * El orden es a proposito: el que lleva mas esperando va arriba, que es el que
 * hay que atender. Ordenar por folio pondria primero al que acaba de entrar.
 */
export async function tableroDeEntregas(): Promise<TableroDeEntregas> {
  const dia = diaOperativoDe();
  const { desde, hasta } = rangoDiaOperativo(dia);
  const ahora = new Date();

  const delDia = { entroEn: { gte: desde, lt: hasta } };
  const aDomicilio = { ...delDia, esADomicilio: true, cancelado: false };

  const [filas, despachadosHoy, ultimo] = await Promise.all([
    prisma.pedido.findMany({
      where: {
        ...aDomicilio,
        // Las dos condiciones dicen lo mismo y las dos van puestas: la hora de
        // salida es el dato crudo del POS, y el estado es lo que derivamos de
        // el. Si alguna vez dejan de coincidir, el pedido no se muestra, que
        // es el lado seguro: mejor que falte uno a que el tablero se llene de
        // pedidos ya despachados y nadie vuelva a creerle.
        salioEn: null,
        estado: { in: [...ESTADOS_SIN_DESPACHAR] },
      },
      orderBy: { entroEn: 'asc' },
      take: TOPE + 1,
      include: {
        cliente: { select: { nombre: true, telefono: true, direccionTexto: true } },
        chofer: {
          select: {
            nombre: true,
            asignaciones: {
              where: { fechaFin: null },
              select: { placa: true },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.pedido.count({ where: { ...aDomicilio, salioEn: { not: null } } }),
    prisma.pedido.findFirst({
      orderBy: { sincronizadoEn: 'desc' },
      select: { sincronizadoEn: true },
    }),
  ]);

  const recortado = filas.length > TOPE;
  const pagina = recortado ? filas.slice(0, TOPE) : filas;

  const pendientes: PedidoPendiente[] = pagina.map((p) => ({
    id: p.id,
    folio: p.folio,
    estado: p.estado,
    entroEn: p.entroEn,
    // entroEn nunca es null en el esquema, asi que el ?? 0 no se usa; esta
    // para que el tipo de la fila sea un numero y no un numero o nada.
    minutosEsperando: minutosDesde(p.entroEn, ahora) ?? 0,
    cliente: p.cliente?.nombre ?? null,
    // El telefono que se marca es el de la ficha; el del pedido puede ser el
    // del vecino que llamo por el.
    telefono: p.cliente?.telefono ?? p.telefonoUsado ?? null,
    direccion: p.cliente?.direccionTexto ?? null,
    repartidor: p.chofer?.nombre ?? null,
    placa: p.chofer?.asignaciones[0]?.placa ?? null,
    total: p.total,
  }));

  return {
    diaOperativo: dia,
    ahora,
    pendientes,
    porTramo: contarPorTramo(pendientes.map((p) => p.minutosEsperando)),
    despachadosHoy,
    recortado,
    ultimaSincronizacion: ultimo?.sincronizadoEn ?? null,
  };
}
