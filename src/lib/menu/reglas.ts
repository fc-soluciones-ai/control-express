/**
 * Que productos del POS se le ofrecen a un cliente en la app.
 *
 * El catalogo del POS es el de la caja: trae productos de comedor, cargos y
 * productos bloqueados que un cliente no debe ver. Esta es la unica regla que
 * decide que se ofrece, y la usan tanto la pantalla como el calculo del pedido,
 * para que lo que se muestra y lo que se acepta no puedan diferir.
 */

/**
 * Grupos del POS que NUNCA se ofrecen como producto.
 *
 * '08' EXPRESS: segun los datos son los cargos de envio (EXPRESS 1400, 1600,
 * 2000) y PEAJES. La app los calcula por su cuenta segun la zona y agrega el
 * renglon correcto; no son algo que el cliente elija.
 * PENDIENTE de confirmar con el dueno cual es la regla de zonas.
 */
export const GRUPOS_FUERA_DEL_MENU: readonly string[] = ['08'];

export interface ProductoOfrecible {
  presente: boolean;
  paraDomicilio: boolean;
  bloqueado: boolean;
  ocultoPorDueno: boolean;
  /** Se guarda pero no decide nada: ver esOfrecible. */
  precioAbierto?: boolean;
  precio: number;
  grupoId: string | null;
}

/** true si el cliente puede ver y pedir este producto. */
export function esOfrecible(p: ProductoOfrecible): boolean {
  if (!p.presente) return false;
  if (!p.paraDomicilio) return false;
  if (p.bloqueado) return false;
  if (p.ocultoPorDueno) return false;
  // precioAbierto NO se usa para decidir: en el POS de esta pizzeria la columna
  // trae un valor distinto de cero en los 563 productos (se comprobo con el menu
  // real), asi que no distingue nada. Los productos que la caja tarifica a mano
  // (ALQUILER DE LOCAL, SERVICIO RESTAURANTE...) se quedan fuera porque el menu
  // de la app se arma a mano, producto por producto.
  if (p.precio <= 0) return false;
  if (p.grupoId !== null && GRUPOS_FUERA_DEL_MENU.includes(p.grupoId)) return false;
  return true;
}
