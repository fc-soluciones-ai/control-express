/**
 * Historial y auditoria.
 *
 * La fuente es eventos_auditoria, que es append-only. No hay una sola escritura
 * en este archivo: aqui solo se lee. Cualquier "correccion" del historial
 * tendria que ser un evento nuevo, nunca la edicion de uno viejo.
 *
 * Esto tenia encima un bloque de metricas de dinero que sumaba cierres,
 * arqueos y abonos. Al salir lo contable, esas tablas ya no existen y la
 * bitacora vuelve a ser lo que siempre fue: la lista de quien hizo que y
 * cuando. El monto sigue en la fila porque los gastos de taller lo llevan.
 */

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { rangoDiaOperativo } from '@/lib/fechas';
import type { TipoEvento } from '@/types/enums';

export interface FiltrosHistorial {
  /** Inclusivo. */
  desde?: Date;
  /** Exclusivo. */
  hasta?: Date;
  choferId?: string;
  cajeroId?: string;
  tipos?: TipoEvento[];
  limite?: number;
  /** Id del ultimo evento de la pagina anterior. */
  cursor?: string;
}

export interface FilaHistorial {
  id: string;
  timestamp: Date;
  tipo: string;
  monto: number | null;
  cajeroNombre: string | null;
  choferNombre: string | null;
  entidadTipo: string | null;
  entidadId: string | null;
  dispositivo: string | null;
  detalle: Record<string, unknown> | null;
}

const LIMITE_POR_DEFECTO = 100;
const LIMITE_MAXIMO = 500;

function condiciones(filtros: FiltrosHistorial): Prisma.EventoAuditoriaWhereInput {
  const where: Prisma.EventoAuditoriaWhereInput = {};

  if (filtros.desde || filtros.hasta) {
    where.timestamp = {
      ...(filtros.desde ? { gte: filtros.desde } : {}),
      ...(filtros.hasta ? { lt: filtros.hasta } : {}),
    };
  }
  if (filtros.choferId) where.choferId = filtros.choferId;
  if (filtros.cajeroId) where.cajeroId = filtros.cajeroId;
  if (filtros.tipos && filtros.tipos.length > 0) where.tipo = { in: [...filtros.tipos] };

  return where;
}

export async function consultarHistorial(
  filtros: FiltrosHistorial = {},
): Promise<{ filas: FilaHistorial[]; hayMas: boolean }> {
  const limite = Math.min(filtros.limite ?? LIMITE_POR_DEFECTO, LIMITE_MAXIMO);

  const eventos = await prisma.eventoAuditoria.findMany({
    where: condiciones(filtros),
    orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
    take: limite + 1,
    ...(filtros.cursor ? { cursor: { id: filtros.cursor }, skip: 1 } : {}),
    include: { cajero: { select: { nombre: true } } },
  });

  const hayMas = eventos.length > limite;
  const pagina = hayMas ? eventos.slice(0, limite) : eventos;

  // Los nombres de repartidor se resuelven de un tiron y no fila por fila: con
  // cien eventos en pantalla, lo segundo serian cien viajes a la base cada vez
  // que alguien cambia un filtro.
  const idsChofer = [...new Set(pagina.map((e) => e.choferId).filter((id): id is string => !!id))];
  const choferes =
    idsChofer.length > 0
      ? await prisma.chofer.findMany({
          where: { id: { in: idsChofer } },
          select: { id: true, nombre: true },
        })
      : [];
  const nombrePorChofer = new Map(choferes.map((c) => [c.id, c.nombre]));

  const filas: FilaHistorial[] = pagina.map((evento) => {
    let detalle: Record<string, unknown> | null = null;
    if (evento.detalle) {
      try {
        detalle = JSON.parse(evento.detalle) as Record<string, unknown>;
      } catch {
        detalle = { crudo: evento.detalle };
      }
    }

    return {
      id: evento.id,
      timestamp: evento.timestamp,
      tipo: evento.tipo,
      monto: evento.monto,
      cajeroNombre: evento.cajero?.nombre ?? null,
      choferNombre: evento.choferId ? (nombrePorChofer.get(evento.choferId) ?? null) : null,
      entidadTipo: evento.entidadTipo,
      entidadId: evento.entidadId,
      dispositivo: evento.dispositivo,
      detalle,
    };
  });

  return { filas, hayMas };
}

/** Rango de un dia operativo, para el filtro rapido de "hoy". */
export function rangoDeDia(dia: string): { desde: Date; hasta: Date } {
  return rangoDiaOperativo(dia);
}

/** Repartidores y cajeros para poblar los selectores del filtro. */
export async function opcionesDeFiltro(): Promise<{
  choferes: Array<{ id: string; nombre: string }>;
  cajeros: Array<{ id: string; nombre: string }>;
}> {
  const [choferes, cajeros] = await Promise.all([
    prisma.chofer.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.cajero.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
  ]);
  return { choferes, cajeros };
}
