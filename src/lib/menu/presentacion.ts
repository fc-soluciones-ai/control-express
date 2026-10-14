/**
 * Como se presenta el menu en la pantalla del cliente: iconos, colores y lo mas
 * pedido. Nada de esto toca precios ni productos.
 */

/**
 * Lo mas vendido en domicilio, segun los ultimos 90 dias del POS (orden de mas a
 * menos). Son claves de plato de la propuesta inicial. Un plato que no exista o
 * este apagado simplemente no sale.
 */
export const DESTACADOS: readonly string[] = [
  'pechuga-y-ala',
  'sandwich-pollo',
  'alitas',
  'hamburguesa-super',
  'muslo-y-cuarto',
  'hamburguesa-estacion',
  'pizza-la-estacion',
  'pizza-jamon-queso',
  'combo-3',
];

const EMOJI_POR_CATEGORIA: Record<string, string> = {
  pizzas: '🍕',
  pollo: '🍗',
  parrilla: '🥩',
  hamburguesas: '🍔',
  combos: '🎁',
  bebidas: '🥤',
  postres: '🍰',
  adicionales: '🍟',
};

/** El icono de un plato: por palabra clave del nombre y, si no, el de su categoria. */
export function emojiDe(nombre: string, categoriaId: string): string {
  const n = nombre.toLowerCase();
  if (n.includes('costilla')) return '🍖';
  if (n.includes('sándwich') || n.includes('sandwich')) return '🥪';
  if (n.includes('ensalada')) return '🥗';
  if (n.includes('papas')) return '🍟';
  if (n.includes('alita')) return '🍗';
  return EMOJI_POR_CATEGORIA[categoriaId] ?? '🍽️';
}

/** El color de fondo de la ficha de un plato, por categoria (hasta que haya fotos). */
export function fondoDe(categoriaId: string): string {
  switch (categoriaId) {
    case 'pizzas':
      return 'from-red-200 to-orange-100';
    case 'pollo':
      return 'from-amber-200 to-yellow-100';
    case 'parrilla':
      return 'from-rose-200 to-orange-100';
    case 'hamburguesas':
      return 'from-orange-200 to-amber-100';
    case 'combos':
      return 'from-lime-200 to-emerald-100';
    default:
      return 'from-stone-200 to-stone-100';
  }
}

/** Texto normalizado para buscar: sin tildes ni mayusculas. */
export function paraBuscar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
