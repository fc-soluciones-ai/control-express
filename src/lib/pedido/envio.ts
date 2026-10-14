/**
 * Cuanto cuesta el envio, segun a donde va.
 *
 * LA REGLA ES PROVISIONAL
 *
 * La caja cobra el envio con unos productos "EXPRESS" de 1.400, 1.600, 2.000 y 2.500
 * colones. Lo que NO sabemos todavia es como decide el cajero cual cobrar. Esto usa
 * la distancia en linea recta desde el local, con cortes que son una SUPOSICION para
 * poder probar el flujo completo. Cuando el dueno diga la regla real, se cambian
 * LOCAL y TRAMOS_DE_ENVIO y nada mas: todo lo demas lee de aqui.
 *
 * El precio NO esta aqui: cada tramo apunta al producto del POS que se cobra, y el
 * precio se lee de ese producto. Asi la app y la caja cobran lo mismo.
 */

export interface Coordenada {
  lat: number;
  lng: number;
}

/**
 * Donde esta el local. PROVISIONAL: es el parque central de Alajuela. Hay que poner
 * la ubicacion real de la pizzeria.
 */
export const LOCAL: Coordenada = { lat: 10.0163, lng: -84.214 };

export interface TramoDeEnvio {
  /** Hasta cuantos kilometros en linea recta (inclusive). */
  hastaKm: number;
  /** El producto del POS que se cobra como envio. */
  productoMenuId: string;
}

/** PROVISIONAL, de menor a mayor distancia. */
export const TRAMOS_DE_ENVIO: readonly TramoDeEnvio[] = [
  { hastaKm: 3, productoMenuId: '08003' }, // EXPRESS 1400
  { hastaKm: 5, productoMenuId: '0105576' }, // EXPRESS 1600
  { hastaKm: 8, productoMenuId: '08007' }, // EXPRESS 2000
  { hastaKm: 12, productoMenuId: '08004' }, // EXPRESS 2500
];

/** Mas lejos que esto no se entrega. */
export const MAXIMO_KM = TRAMOS_DE_ENVIO[TRAMOS_DE_ENVIO.length - 1]!.hastaKm;

/** Cuanto se le dice al cliente que tarda (minutos). PROVISIONAL. */
export const TIEMPO_ESTIMADO = { desde: 35, hasta: 50 } as const;

const RADIO_TIERRA_KM = 6371;

/** Distancia en linea recta entre dos puntos (formula de haversine). */
export function distanciaKm(a: Coordenada, b: Coordenada): number {
  const rad = (g: number): number => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type ResultadoDeTramo =
  | { dentro: true; tramo: TramoDeEnvio; km: number }
  | { dentro: false; km: number };

/** El tramo que le toca a un punto, o que esta fuera de la zona de entrega. */
export function tramoPara(
  punto: Coordenada,
  local: Coordenada = LOCAL,
  tramos: readonly TramoDeEnvio[] = TRAMOS_DE_ENVIO,
): ResultadoDeTramo {
  const km = distanciaKm(local, punto);
  const tramo = tramos.find((t) => km <= t.hastaKm);
  return tramo ? { dentro: true, tramo, km } : { dentro: false, km };
}

// ---------------------------------------------------------------------------
// Validacion de lo que manda el telefono
// ---------------------------------------------------------------------------

/**
 * Costa Rica cabe en este rectangulo. Un punto fuera es un error del GPS o alguien
 * probando la ruta: se rechaza antes de calcular nada.
 */
export function estaEnCostaRica(p: Coordenada): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= 8 &&
    p.lat <= 11.3 &&
    p.lng >= -86 &&
    p.lng <= -82.5
  );
}

/** Enlace para abrir el punto en Google Maps. */
export function enlaceDeMapa(p: Coordenada): string {
  return `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

/** Enlace para que el repartidor navegue con Waze hasta el punto. */
export function enlaceDeWaze(p: Coordenada): string {
  return `https://waze.com/ul?ll=${p.lat.toFixed(6)},${p.lng.toFixed(6)}&navigate=yes`;
}
