/**
 * El carrito del cliente: lineas, totales y como se juntan.
 *
 * Es solo para MOSTRAR. Cuando el pedido se confirme, el servidor vuelve a
 * calcularlo todo desde los productos del POS y no se fia de estos numeros.
 */

import type { ExtraElegido } from './estructura';

export interface ExtraEnLinea {
  complementoId: string;
  etiqueta: string;
  cantidad: number;
  /** Centimos por unidad. */
  precio: number;
}

export interface LineaDelCarrito {
  /** Identifica la combinacion exacta: dos lineas iguales se juntan. */
  llave: string;
  itemId: string;
  varianteId: string;
  nombre: string;
  /** "Familiar", "Pechuga y cuarto · Agrandadas"... Vacio si no hubo decisiones. */
  detalle: string;
  cantidad: number;
  /** Centimos de UNA unidad con sus extras. */
  precioUnidad: number;
  extras: ExtraEnLinea[];
  /** Frases tocadas ("Sin cebolla") y lo que escribio el cliente. */
  notas: string[];
}

export const MAXIMO_POR_LINEA = 20;

/** Normaliza una nota escrita a mano: sin espacios de mas, sin saltos de linea. */
export function limpiarNota(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, 100);
}

function llaveDe(varianteId: string, extras: ExtraEnLinea[], notas: string[]): string {
  const e = [...extras]
    .sort((a, b) => a.complementoId.localeCompare(b.complementoId))
    .map((x) => `${x.complementoId}x${x.cantidad}`)
    .join(',');
  const n = [...notas].sort().join('|');
  return `${varianteId}#${e}#${n}`;
}

export function crearLinea(datos: {
  itemId: string;
  varianteId: string;
  nombre: string;
  detalle: string;
  cantidad: number;
  precioUnidad: number;
  extras: ExtraEnLinea[];
  notas: string[];
}): LineaDelCarrito {
  const notas = datos.notas.map(limpiarNota).filter((n) => n !== '');
  return {
    llave: llaveDe(datos.varianteId, datos.extras, notas),
    itemId: datos.itemId,
    varianteId: datos.varianteId,
    nombre: datos.nombre,
    detalle: datos.detalle,
    cantidad: datos.cantidad,
    precioUnidad: datos.precioUnidad,
    extras: datos.extras,
    notas,
  };
}

/** Suma una linea al carrito; si ya hay una igual, suma las unidades. */
export function agregarLinea(carrito: LineaDelCarrito[], linea: LineaDelCarrito): LineaDelCarrito[] {
  const hay = carrito.find((l) => l.llave === linea.llave);
  if (!hay) return [...carrito, linea];
  return carrito.map((l) =>
    l.llave === linea.llave
      ? { ...l, cantidad: Math.min(MAXIMO_POR_LINEA, l.cantidad + linea.cantidad) }
      : l,
  );
}

/** Cambia las unidades de una linea; a cero la quita. */
export function cambiarCantidad(
  carrito: LineaDelCarrito[],
  llave: string,
  cantidad: number,
): LineaDelCarrito[] {
  if (cantidad <= 0) return carrito.filter((l) => l.llave !== llave);
  return carrito.map((l) =>
    l.llave === llave ? { ...l, cantidad: Math.min(MAXIMO_POR_LINEA, cantidad) } : l,
  );
}

export function totalDeLinea(l: LineaDelCarrito): number {
  return l.precioUnidad * l.cantidad;
}

export function totalDelCarrito(carrito: LineaDelCarrito[]): number {
  return carrito.reduce((suma, l) => suma + totalDeLinea(l), 0);
}

export function unidadesDelCarrito(carrito: LineaDelCarrito[]): number {
  return carrito.reduce((suma, l) => suma + l.cantidad, 0);
}

/** Lo que el servidor necesita saber de cada extra, sin precios. */
export function extrasParaElServidor(extras: ExtraEnLinea[]): ExtraElegido[] {
  return extras.map((e) => ({ complementoId: e.complementoId, cantidad: e.cantidad }));
}

/**
 * Una linea guardada en el navegador puede estar vieja o rota (otra version, otro
 * menu). Se acepta solo si tiene la forma esperada; lo demas se descarta.
 */
export function leerCarritoGuardado(crudo: string | null): LineaDelCarrito[] {
  if (!crudo) return [];
  try {
    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];
    const salida: LineaDelCarrito[] = [];
    for (const d of datos) {
      if (typeof d !== 'object' || d === null) continue;
      const l = d as Partial<LineaDelCarrito>;
      if (
        typeof l.llave !== 'string' ||
        typeof l.itemId !== 'string' ||
        typeof l.varianteId !== 'string' ||
        typeof l.nombre !== 'string' ||
        typeof l.detalle !== 'string' ||
        !Number.isInteger(l.cantidad) ||
        !Number.isInteger(l.precioUnidad) ||
        !Array.isArray(l.extras) ||
        !Array.isArray(l.notas)
      ) {
        continue;
      }
      if ((l.cantidad as number) < 1 || (l.cantidad as number) > MAXIMO_POR_LINEA) continue;
      if ((l.precioUnidad as number) < 0) continue;
      salida.push(l as LineaDelCarrito);
    }
    return salida;
  } catch {
    return [];
  }
}
