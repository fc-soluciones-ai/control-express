/**
 * Lo que manda el telefono al confirmar un pedido, revisado ANTES de tocar la base.
 *
 * La ruta es publica: cualquiera puede mandarle cualquier cosa. Aqui se decide que
 * es un pedido y que es basura, y se devuelven mensajes que el cliente entiende.
 */

import { leerTelefono } from '@/lib/clientes/normalizar';
import { limpiarNota } from '@/lib/menu/carrito';
import type { ExtraElegido } from '@/lib/menu/estructura';

import { estaEnCostaRica } from './envio';

export const METODOS_DE_PAGO = ['EFECTIVO', 'SINPE', 'TARJETA'] as const;
export type MetodoDePago = (typeof METODOS_DE_PAGO)[number];

export interface LineaEntrante {
  varianteId: string;
  cantidad: number;
  extras: ExtraElegido[];
  notas: string[];
}

export interface PedidoEntrante {
  clave: string;
  nombre: string;
  telefono: string;
  direccion: string;
  referencia: string | null;
  lat: number | null;
  lng: number | null;
  precisionM: number | null;
  metodoPago: MetodoDePago;
  /** Centimos. Solo en efectivo. */
  pagaCon: number | null;
  referenciaPago: string | null;
  nota: string | null;
  lineas: LineaEntrante[];
}

export const MAX_LINEAS = 30;
export const MAX_CANTIDAD = 20;
export const MAX_EXTRAS_POR_LINEA = 15;
export const MAX_NOTAS_POR_LINEA = 6;

export type ResultadoDeValidacion =
  | { ok: true; pedido: PedidoEntrante }
  | { ok: false; error: string };

const mal = (error: string): ResultadoDeValidacion => ({ ok: false, error });

function texto(valor: unknown, largo: number): string {
  return typeof valor === 'string' ? limpiarNota(valor).slice(0, largo) : '';
}

function numeroOnulo(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** Revisa la forma de lo recibido. No consulta la base ni calcula precios. */
export function validarPedido(crudo: unknown): ResultadoDeValidacion {
  if (typeof crudo !== 'object' || crudo === null) return mal('El pedido no llego completo.');
  const c = crudo as Record<string, unknown>;

  const clave = typeof c.clave === 'string' ? c.clave.trim() : '';
  if (!/^[A-Za-z0-9-]{16,64}$/.test(clave)) return mal('El pedido no llego completo.');

  const nombre = texto(c.nombre, 80);
  if (nombre.length < 2) return mal('Escribí tu nombre.');

  const tel = leerTelefono(typeof c.telefono === 'string' ? c.telefono : null);
  if (!tel) return mal('El teléfono no parece válido. Escribí los 8 números.');

  const direccion = texto(c.direccion, 200);
  if (direccion.length < 5) return mal('Escribí la dirección: calle, barrio o señas.');

  const referencia = texto(c.referencia, 200) || null;
  const nota = texto(c.nota, 200) || null;

  const lat = numeroOnulo(c.lat);
  const lng = numeroOnulo(c.lng);
  if ((lat === null) !== (lng === null)) return mal('La ubicación está incompleta.');
  if (lat !== null && lng !== null && !estaEnCostaRica({ lat, lng })) {
    return mal('La ubicación no está en Costa Rica.');
  }
  const precisionM = numeroOnulo(c.precisionM);

  const metodo = c.metodoPago;
  if (typeof metodo !== 'string' || !(METODOS_DE_PAGO as readonly string[]).includes(metodo)) {
    return mal('Elegí cómo vas a pagar.');
  }

  const pagaCon = numeroOnulo(c.pagaCon);
  if (pagaCon !== null && (!Number.isInteger(pagaCon) || pagaCon < 0 || pagaCon > 100_000_000)) {
    return mal('El monto con el que pagás no es válido.');
  }
  const referenciaPago = texto(c.referenciaPago, 40) || null;

  if (!Array.isArray(c.lineas) || c.lineas.length === 0) return mal('Tu pedido está vacío.');
  if (c.lineas.length > MAX_LINEAS) return mal('El pedido es demasiado grande. Llamanos.');

  const lineas: LineaEntrante[] = [];
  for (const l of c.lineas) {
    if (typeof l !== 'object' || l === null) return mal('Una línea del pedido no es válida.');
    const x = l as Record<string, unknown>;
    if (typeof x.varianteId !== 'string' || x.varianteId.length === 0 || x.varianteId.length > 40) {
      return mal('Una línea del pedido no es válida.');
    }
    const cantidad = x.cantidad;
    if (!Number.isInteger(cantidad) || (cantidad as number) < 1 || (cantidad as number) > MAX_CANTIDAD) {
      return mal(`La cantidad tiene que ser de 1 a ${MAX_CANTIDAD}.`);
    }
    const extrasCrudos = Array.isArray(x.extras) ? x.extras : [];
    if (extrasCrudos.length > MAX_EXTRAS_POR_LINEA) return mal('Demasiados extras en una línea.');
    const extras: ExtraElegido[] = [];
    for (const e of extrasCrudos) {
      if (typeof e !== 'object' || e === null) return mal('Un extra no es válido.');
      const y = e as Record<string, unknown>;
      if (typeof y.complementoId !== 'string' || y.complementoId.length > 40) return mal('Un extra no es válido.');
      if (!Number.isInteger(y.cantidad)) return mal('Un extra no es válido.');
      extras.push({ complementoId: y.complementoId, cantidad: y.cantidad as number });
    }
    const notasCrudas = Array.isArray(x.notas) ? x.notas : [];
    if (notasCrudas.length > MAX_NOTAS_POR_LINEA) return mal('Demasiadas notas en una línea.');
    const notas = notasCrudas.map((n) => texto(n, 100)).filter((n) => n !== '');
    lineas.push({ varianteId: x.varianteId, cantidad: cantidad as number, extras, notas });
  }

  return {
    ok: true,
    pedido: {
      clave,
      nombre,
      telefono: tel.numero,
      direccion,
      referencia,
      lat,
      lng,
      precisionM: precisionM === null ? null : Math.max(0, Math.round(precisionM)),
      metodoPago: metodo as MetodoDePago,
      pagaCon,
      referenciaPago,
      nota,
      lineas,
    },
  };
}
