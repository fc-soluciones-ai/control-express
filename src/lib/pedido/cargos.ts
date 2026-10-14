/**
 * Lo que se le suma al pedido ademas de la comida.
 *
 * EL CARGO DE LA PLATAFORMA
 *
 * Cada pedido de la app lleva 250 colones por el uso de la plataforma. Es lo que
 * gana el dueno del sistema por la tramitologia que hace la aplicacion; no es de la
 * pizzeria. Va como un campo aparte en cada pedido (cargoApp) y no mezclado con el
 * envio, para poder sumarlo en un reporte y para que nadie lo confunda con una
 * venta de comida.
 *
 * PENDIENTE de decidir con el contador: si ese cargo lleva impuesto, y como se
 * anota en el POS cuando el pedido se escriba ahi (si no se anota, la caja del
 * repartidor sobra 250 colones por pedido).
 */

/** Centimos. 250 colones. */
export const CARGO_PLATAFORMA = 25_000;

/** El nombre con que lo ve el cliente. */
export const NOMBRE_CARGO_PLATAFORMA = 'Uso de la plataforma';

/** El envio fijo mientras se hacen pruebas: 1.500 colones, en centimos. */
export const ENVIO_FIJO_DE_PRUEBA = 150_000;

/**
 * Como se calcula el envio.
 *  FIJO       un monto parejo (para pruebas).
 *  DISTANCIA  por tramos de kilometros, con las tarifas EXPRESS de la caja.
 */
export const MODOS_DE_ENVIO = ['FIJO', 'DISTANCIA'] as const;
export type ModoDeEnvio = (typeof MODOS_DE_ENVIO)[number];

/** Sin ajuste guardado, el envio es fijo: la regla por distancia todavia es provisional. */
export const MODO_DE_ENVIO_INICIAL: ModoDeEnvio = 'FIJO';

export function comoModoDeEnvio(valor: string | null | undefined): ModoDeEnvio {
  return valor === 'DISTANCIA' ? 'DISTANCIA' : 'FIJO';
}
