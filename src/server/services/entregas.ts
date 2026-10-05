/**
 * El tablero de entregas: que pedidos estan sin entregar y desde cuando.
 *
 * ESTE ES EL PROBLEMA DEL NEGOCIO
 *
 * La pizzeria no pierde plata por el cierre de caja: pierde clientes porque
 * los pedidos llegan tarde. Hasta hoy nadie en el mostrador podia decir
 * cuantos pedidos estaban atrasados en este momento, porque el POS no tiene
 * esa pantalla. Lo unico que habia era la queja del cliente cuando llamaba.
 *
 * DE DONDE SALEN LOS DATOS
 *
 * De la tabla pedidos, que el agente del POS llena cada treinta segundos
 * leyendo la base de Soft Restaurant. No hay Excel, no hay carga manual y no
 * hay nada que exportar: se consulta la base y se pinta.
 *
 * QUE CUENTA COMO "SIN ENTREGAR"
 *
 * Un pedido a domicilio, del dia operativo en curso, que no esta entregado ni
 * cancelado. Las tres condiciones importan:
 *
 * - A domicilio, porque lo que se come en el local no tiene marca de llegada y
 *   se quedaria en la lista para siempre, en rojo, sin que nadie pueda sacarlo.
 * - Del dia operativo, por lo mismo: un cheque que quedo abierto el martes no
 *   es un pedido atrasado, es un cheque mal cerrado, y mezclarlos hace que el
 *   tablero deje de servir a los tres dias.
 * - Ni entregado ni cancelado, que es lo que se pregunta.
 *
 * El estado lo deriva el agente de las marcas de tiempo del POS. Ver
 * estadoDelPedido en pos.ts.
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
 * Los estados que significan "todavia no llego".
 *
 * Va tipado contra EstadoPedido para que agregar un estado nuevo al enum y
 * olvidarse de decidir si es pendiente no compile.
 */
export const ESTADOS_PENDIENTES: ReadonlyArray<EstadoPedido> = [
  'RECIBIDO',
  'EN_COCINA',
  'ASIGNADO',
  'EN_CAMINO',
];

export interface PedidoPendiente {
  id: string;
  folio: string;
  estado: string;
  /** Cuando entro al POS. Es el reloj que cuenta para el cliente. */
  entroEn: Date;
  /** Cuando salio la moto, si ya salio. */
  salioEn: Date | null;
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
  /** Entregados del dia, para saber si el turno va bien o va mal. */
  entregadosHoy: number;
  /** True cuando se alcanzo el tope y la lista esta recortada. */
  recortado: boolean;
  /** Ultima vez que el agente del POS mando algo. Null si nunca. */
  ultimaSincronizacion: Date | null;
}

/**
 * Los pedidos sin entregar, del mas viejo al mas nuevo.
 *
 * El orden es a proposito: el que lleva mas esperando va arriba, que es el que
 * hay que atender. Ordenar por folio pondria primero al que acaba de entrar.
 */
export async function tableroDeEntregas(): Promise<TableroDeEntregas> {
  const dia = diaOperativoDe();
  const { desde, hasta } = rangoDiaOperativo(dia);
  const ahora = new Date();

  const delDia = { entroEn: { gte: desde, lt: hasta } };

  const [filas, entregadosHoy, ultimo] = await Promise.all([
    prisma.pedido.findMany({
      where: {
        ...delDia,
        esADomicilio: true,
        cancelado: false,
        estado: { in: [...ESTADOS_PENDIENTES] },
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
    prisma.pedido.count({
      where: { ...delDia, esADomicilio: true, cancelado: false, estado: 'ENTREGADO' },
    }),
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
    salioEn: p.salioEn,
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
    entregadosHoy,
    recortado,
    ultimaSincronizacion: ultimo?.sincronizadoEn ?? null,
  };
}
