/**
 * Bitacora de auditoria.
 *
 * Se escribe DENTRO de la misma transaccion que el movimiento que describe.
 * Si el movimiento se revierte, su evento tambien: nunca queda un asiento en
 * la bitacora que no corresponda a nada, ni un movimiento sin rastro.
 */

import type { Prisma } from '@prisma/client';

import type { TipoEvento } from '@/types/enums';

export interface EntradaEvento {
  tipo: TipoEvento;
  cajeroId?: string | null;
  choferId?: string | null;
  entidadTipo?: string;
  entidadId?: string;
  /** Centimos, si el evento mueve dinero. */
  monto?: number | null;
  detalle?: Record<string, unknown>;
  dispositivo?: string | null;
  /** Como estaba el registro antes del cambio. Solo los campos que cambiaron. */
  antes?: Record<string, unknown> | null;
  /** Como quedo. */
  despues?: Record<string, unknown> | null;
  /** Direccion de quien lo hizo. Ver server/peticion.ts. */
  ip?: string | null;
}

/** Las fechas se comparan por su valor, no por la identidad del objeto. */
function normalizar(valor: unknown): unknown {
  if (valor instanceof Date) return valor.toISOString();
  if (valor === undefined) return null;
  return valor;
}

/**
 * Deja solo los campos que de verdad cambiaron.
 *
 * Guardar la fila entera en cada edicion esconde el cambio entre veinte
 * campos iguales, y es justo el cambio lo que alguien va a buscar despues.
 */
export function soloLoQueCambio(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): { antes: Record<string, unknown>; despues: Record<string, unknown> } | null {
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const campo of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    if (normalizar(antes[campo]) === normalizar(despues[campo])) continue;
    a[campo] = antes[campo] ?? null;
    d[campo] = despues[campo] ?? null;
  }
  return Object.keys(d).length > 0 ? { antes: a, despues: d } : null;
}

export async function registrarEvento(
  tx: Prisma.TransactionClient,
  entrada: EntradaEvento,
): Promise<void> {
  await tx.eventoAuditoria.create({
    data: {
      tipo: entrada.tipo,
      cajeroId: entrada.cajeroId ?? null,
      choferId: entrada.choferId ?? null,
      entidadTipo: entrada.entidadTipo ?? null,
      entidadId: entrada.entidadId ?? null,
      monto: entrada.monto ?? null,
      detalle: entrada.detalle ? JSON.stringify(entrada.detalle) : null,
      dispositivo: entrada.dispositivo ?? null,
      valoresAnteriores: entrada.antes ? JSON.stringify(entrada.antes) : null,
      valoresNuevos: entrada.despues ? JSON.stringify(entrada.despues) : null,
      ip: entrada.ip ?? null,
    },
  });
}
