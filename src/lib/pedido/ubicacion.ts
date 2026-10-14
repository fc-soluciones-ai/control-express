/**
 * Las direcciones de entrega que el cliente guarda en su telefono.
 *
 * COMO UBER EATS
 *
 * La app toma la ubicacion al abrir, la deja guardada y la muestra arriba como
 * "Entregar en...". El cliente puede guardar varias (Casa, Trabajo) y cambiar entre
 * ellas. Hoy viven en el telefono; cuando haya cuenta con telefono verificado, pasan
 * al servidor.
 *
 * Es lo que lee el navegador de un almacenamiento que cualquiera puede editar, asi
 * que NADA de esto se cree: se valida la forma al leerlo, y el servidor vuelve a
 * comprobar la ubicacion y recalcula el envio.
 */

import { estaEnCostaRica } from './envio';

export interface DireccionGuardada {
  /** Identifica la direccion en la lista (no es un dato del cliente). */
  id: string;
  /** "Casa", "Trabajo"... Lo escribe el cliente. */
  etiqueta: string;
  lat: number;
  lng: number;
  /** Precision del GPS al marcarla, en metros. 0 si la movio a mano en el mapa. */
  precisionM: number;
  /** Las senas: lo que el mapa no sabe ("casa verde, porton negro"). */
  senas: string;
}

export const MAX_DIRECCIONES = 5;
export const LARGO_ETIQUETA = 20;
export const LARGO_SENAS = 200;

const limpiar = (t: unknown, largo: number): string =>
  typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, largo) : '';

/** Una direccion con la forma correcta, o null si no sirve. */
export function direccionValida(d: unknown): DireccionGuardada | null {
  if (typeof d !== 'object' || d === null) return null;
  const x = d as Record<string, unknown>;
  if (typeof x.id !== 'string' || !/^[A-Za-z0-9-]{4,64}$/.test(x.id)) return null;
  if (typeof x.lat !== 'number' || typeof x.lng !== 'number') return null;
  if (!estaEnCostaRica({ lat: x.lat, lng: x.lng })) return null;
  const precision = typeof x.precisionM === 'number' && Number.isFinite(x.precisionM) ? Math.max(0, Math.round(x.precisionM)) : 0;
  return {
    id: x.id,
    etiqueta: limpiar(x.etiqueta, LARGO_ETIQUETA),
    lat: x.lat,
    lng: x.lng,
    precisionM: precision,
    senas: limpiar(x.senas, LARGO_SENAS),
  };
}

export interface Libreta {
  direcciones: DireccionGuardada[];
  /** El id de la que se usa ahora, o null si todavia no eligio ninguna. */
  activaId: string | null;
}

export const LIBRETA_VACIA: Libreta = { direcciones: [], activaId: null };

/** Lo guardado en el navegador, revisado. Lo roto se descarta. */
export function leerLibreta(crudo: string | null): Libreta {
  if (!crudo) return LIBRETA_VACIA;
  try {
    const datos: unknown = JSON.parse(crudo);
    if (typeof datos !== 'object' || datos === null) return LIBRETA_VACIA;
    const d = datos as { direcciones?: unknown; activaId?: unknown };
    const direcciones = (Array.isArray(d.direcciones) ? d.direcciones : [])
      .map(direccionValida)
      .filter((x): x is DireccionGuardada => x !== null)
      .slice(0, MAX_DIRECCIONES);
    const activaId =
      typeof d.activaId === 'string' && direcciones.some((x) => x.id === d.activaId) ? d.activaId : (direcciones[0]?.id ?? null);
    return { direcciones, activaId };
  } catch {
    return LIBRETA_VACIA;
  }
}

export function direccionActiva(l: Libreta): DireccionGuardada | null {
  return l.direcciones.find((d) => d.id === l.activaId) ?? null;
}

/**
 * Guarda una direccion y la deja como la activa. Si ya habia una con la misma
 * etiqueta, la reemplaza; si se llena la libreta, sale la mas vieja que no sea la
 * activa.
 */
export function guardarDireccion(l: Libreta, d: DireccionGuardada): Libreta {
  const sinRepetida = l.direcciones.filter((x) => x.id !== d.id && !(d.etiqueta !== '' && x.etiqueta === d.etiqueta));
  const direcciones = [d, ...sinRepetida].slice(0, MAX_DIRECCIONES);
  return { direcciones, activaId: d.id };
}

export function elegirDireccion(l: Libreta, id: string): Libreta {
  return l.direcciones.some((d) => d.id === id) ? { ...l, activaId: id } : l;
}

export function quitarDireccion(l: Libreta, id: string): Libreta {
  const direcciones = l.direcciones.filter((d) => d.id !== id);
  return { direcciones, activaId: l.activaId === id ? (direcciones[0]?.id ?? null) : l.activaId };
}

/** Lo que se lee arriba: "Casa · casa verde, porton negro", recortado. */
export function tituloDeDireccion(d: DireccionGuardada, max = 34): string {
  const base = [d.etiqueta, d.senas].filter((t) => t !== '').join(' · ') || 'Ubicación marcada';
  return base.length > max ? `${base.slice(0, max - 1)}…` : base;
}

/** Un id corto y unico para una direccion nueva. */
export function nuevoIdDeDireccion(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(12);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
