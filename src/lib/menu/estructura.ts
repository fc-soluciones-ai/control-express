/**
 * La logica del menu de la app, sin base de datos ni pantalla.
 *
 * Vive aparte porque la usan dos lados que tienen que estar de acuerdo: la
 * pantalla (para saber que botones mostrar) y el servidor (para volver a
 * calcular el pedido y no fiarse de los precios que mande el telefono).
 *
 * Todo el dinero es en centimos enteros.
 */

/** Lo que el cliente decidio: {"Tamano": "Familiar"}. */
export type Opciones = Record<string, string>;

export interface VarianteVista {
  id: string;
  opciones: Opciones;
  /** Centimos, con impuesto, tal como los cobra la caja. */
  precio: number;
  productoMenuId: string;
}

export interface ComplementoVista {
  id: string;
  etiqueta: string;
  /** Centimos, con impuesto. */
  precio: number;
  /** En que variantes aplica. {} = siempre. */
  filtro: Opciones;
  maximo: number;
  productoMenuId: string;
}

export interface ItemVista {
  id: string;
  clave: string;
  categoriaId: string;
  nombre: string;
  descripcion: string | null;
  /** Orden en que se le preguntan las decisiones al cliente. */
  ejes: string[];
  notasRapidas: string[];
  variantes: VarianteVista[];
  complementos: ComplementoVista[];
}

export interface EjeVista {
  nombre: string;
  valores: string[];
}

/**
 * Las decisiones que hay que tomar para este plato, en orden.
 *
 * El orden lo da `orden` (el campo `ejes` del plato). Lo que no este en esa lista
 * se agrega al final, en el orden de las claves de la primera variante. Los
 * valores salen en el orden en que aparecen las variantes.
 */
export function ejesDe(variantes: VarianteVista[], orden: string[] = []): EjeVista[] {
  const primera = variantes[0];
  if (!primera) return [];
  const claves = Object.keys(primera.opciones);
  const nombres = [...orden.filter((n) => claves.includes(n)), ...claves.filter((n) => !orden.includes(n))];
  const ejes: EjeVista[] = nombres.map((nombre) => ({ nombre, valores: [] }));
  for (const v of variantes) {
    for (const eje of ejes) {
      const valor = v.opciones[eje.nombre];
      if (valor !== undefined && !eje.valores.includes(valor)) eje.valores.push(valor);
    }
  }
  return ejes;
}

/**
 * Los valores de un eje que todavia se pueden escoger, dado lo ya escogido.
 *
 * Un plato no tiene por que tener todas las combinaciones: la pizza personal no
 * existe en "Solo pollo". Si el cliente ya eligio el tamano, solo se le ofrecen
 * los sabores que existen en ese tamano.
 */
export function valoresPosibles(
  variantes: VarianteVista[],
  eje: string,
  elegido: Opciones,
): string[] {
  const salida: string[] = [];
  for (const v of variantes) {
    const compatible = Object.entries(elegido).every(
      ([k, valor]) => k === eje || v.opciones[k] === undefined || v.opciones[k] === valor,
    );
    const valor = v.opciones[eje];
    if (compatible && valor !== undefined && !salida.includes(valor)) salida.push(valor);
  }
  return salida;
}

/** La variante exacta que corresponde a lo escogido, o null si falta decidir algo. */
export function varianteElegida(
  variantes: VarianteVista[],
  elegido: Opciones,
): VarianteVista | null {
  const coinciden = variantes.filter((v) => {
    const claves = Object.keys(v.opciones);
    return claves.every((k) => elegido[k] === v.opciones[k]);
  });
  return coinciden.length === 1 ? coinciden[0]! : null;
}

/** Los extras que se pueden agregar a la variante escogida. */
export function complementosDe(
  complementos: ComplementoVista[],
  variante: VarianteVista,
): ComplementoVista[] {
  return complementos.filter((c) =>
    Object.entries(c.filtro).every(([k, valor]) => variante.opciones[k] === valor),
  );
}

/** El precio de la ficha del menu: el mas bajo entre sus variantes ("desde"). */
export function precioDesde(variantes: VarianteVista[]): number {
  return variantes.length === 0 ? 0 : Math.min(...variantes.map((v) => v.precio));
}

/** Cuantos extras de un mismo tipo, tal como los eligio el cliente. */
export interface ExtraElegido {
  complementoId: string;
  cantidad: number;
}

/**
 * Lo que cuesta UNA unidad del plato con sus extras. Devuelve null si algo no
 * cuadra (un extra que no aplica a esa variante o mas unidades de las permitidas),
 * para que el servidor rechace el pedido en vez de cobrar mal.
 */
export function precioDeUnidad(
  variante: VarianteVista,
  complementos: ComplementoVista[],
  extras: ExtraElegido[],
): number | null {
  const aplicables = new Map(complementosDe(complementos, variante).map((c) => [c.id, c] as const));
  let total = variante.precio;
  const vistos = new Set<string>();
  for (const e of extras) {
    const c = aplicables.get(e.complementoId);
    if (!c) return null;
    if (vistos.has(e.complementoId)) return null;
    vistos.add(e.complementoId);
    if (!Number.isInteger(e.cantidad) || e.cantidad < 1 || e.cantidad > c.maximo) return null;
    total += c.precio * e.cantidad;
  }
  return total;
}
