/**
 * La primera version del menu de la app, para las categorias principales.
 *
 * Sale del menu real del POS (copiado el 13 de octubre de 2026). Cada opcion apunta
 * a un producto del POS por su idproducto. Los ids pares de domicilio y la elección
 * entre duplicados se hicieron mirando ese menu; ver docs/MENU-DE-LA-APP.md.
 *
 * ES UN PUNTO DE PARTIDA, NO LA VERDAD: el dueno la revisa y la cambia (renombrar,
 * ocultar, reordenar). Por eso aplicarla es de solo agregar: nunca pisa lo que ya
 * existe.
 *
 * Quedan para una segunda etapa: bebidas, postres, adicionales, mitad y mitad,
 * YOBEL y FIESTA NINO.
 */

import type { Opciones } from './estructura';

export interface VariantePropuesta {
  /** idproducto del POS. */
  producto: string;
  opciones: Opciones;
}

export interface ComplementoPropuesta {
  producto: string;
  etiqueta: string;
  filtro?: Opciones;
  maximo?: number;
}

export interface ItemPropuesto {
  clave: string;
  nombre: string;
  descripcion?: string;
  notasRapidas?: string[];
  variantes: VariantePropuesta[];
  complementos?: ComplementoPropuesta[];
}

export interface CategoriaPropuesta {
  id: string;
  nombre: string;
  items: ItemPropuesto[];
}

const TAMANO = 'Tamaño';
const ACOMPANAMIENTO = 'Acompañamiento';

// --- Pizzas ----------------------------------------------------------------

/**
 * Cada sabor, con su producto en cada tamano. Un sabor que no existe en un tamano
 * (la personal no tiene "Solo pollo") queda sin ese tamano.
 */
const SABORES: Array<{
  clave: string;
  nombre: string;
  personal?: string;
  mediana?: string;
  familiar?: string;
}> = [
  { clave: 'estacion-pollo', nombre: 'Estación Pollo', personal: '03004', mediana: '02004', familiar: '01004' },
  { clave: 'hawaiana', nombre: 'Hawaiana', personal: '03006', mediana: '02006', familiar: '01006' },
  { clave: 'jamon-queso', nombre: 'Jamón y Queso', personal: '03008', mediana: '02008', familiar: '01008' },
  { clave: 'jamon-hongos', nombre: 'Jamón y Hongos', personal: '03010', mediana: '02010', familiar: '01010' },
  { clave: 'la-estacion', nombre: 'La Estación', personal: '03012', mediana: '02012', familiar: '01012' },
  { clave: 'margarita', nombre: 'Margarita', personal: '03014', mediana: '02014', familiar: '01014' },
  { clave: 'mozzarella', nombre: 'Mozzarella', personal: '03016', mediana: '02016', familiar: '01016' },
  { clave: 'pepperoni', nombre: 'Pepperoni', personal: '03018', mediana: '02018', familiar: '01018' },
  { clave: 'rustica', nombre: 'Rústica', personal: '03020', mediana: '02020', familiar: '01022' },
  { clave: 'salami', nombre: 'Salami', personal: '03022', mediana: '02022', familiar: '01024' },
  { clave: 'solo-pollo', nombre: 'Solo Pollo', mediana: '02026', familiar: '01028' },
  { clave: 'suprema', nombre: 'Suprema', personal: '03026', mediana: '02028', familiar: '01030' },
  { clave: 'tocineta', nombre: 'Tocineta', personal: '03028', mediana: '02030', familiar: '01032' },
  { clave: 'vegetariana', nombre: 'Vegetariana', personal: '03030', mediana: '02032', familiar: '01034' },
];

/**
 * Los extras de cada tamano. En la mediana, jalapenos, jamon, queso y salami estan
 * dos veces en el POS (a 500 y a 505); se usa uno solo.
 */
const EXTRAS_PIZZA: Array<{ etiqueta: string; personal?: string; mediana?: string; familiar?: string }> = [
  { etiqueta: 'Aceitunas', personal: '03032', mediana: '02034', familiar: '01036' },
  { etiqueta: 'Hongos', personal: '03034', mediana: '02036', familiar: '01038' },
  { etiqueta: 'Jalapeños', personal: '03036', mediana: '02037', familiar: '01040' },
  { etiqueta: 'Jamón', personal: '03038', mediana: '02040', familiar: '01042' },
  { etiqueta: 'Carne molida', personal: '03040', mediana: '02042', familiar: '01044' },
  { etiqueta: 'Pepperoni', personal: '03043', mediana: '02044', familiar: '01046' },
  { etiqueta: 'Queso', personal: '03045', mediana: '02045', familiar: '01048' },
  { etiqueta: 'Salami', mediana: '02048', familiar: '01050' },
  { etiqueta: 'Tomate', personal: '03049', mediana: '02050', familiar: '01052' },
  { etiqueta: 'Carne mechada', familiar: '01058' },
];

function pizzas(): ItemPropuesto[] {
  const complementos: ComplementoPropuesta[] = [];
  for (const extra of EXTRAS_PIZZA) {
    for (const [tam, producto] of [
      ['Personal', extra.personal],
      ['Mediana', extra.mediana],
      ['Familiar', extra.familiar],
    ] as const) {
      if (producto) complementos.push({ producto, etiqueta: `Extra ${extra.etiqueta.toLowerCase()}`, filtro: { [TAMANO]: tam }, maximo: 3 });
    }
  }

  return SABORES.map((s) => {
    const variantes: VariantePropuesta[] = [];
    if (s.personal) variantes.push({ producto: s.personal, opciones: { [TAMANO]: 'Personal' } });
    if (s.mediana) variantes.push({ producto: s.mediana, opciones: { [TAMANO]: 'Mediana' } });
    if (s.familiar) variantes.push({ producto: s.familiar, opciones: { [TAMANO]: 'Familiar' } });
    return {
      clave: `pizza-${s.clave}`,
      nombre: `Pizza ${s.nombre}`,
      notasRapidas: ['Sin cebolla', 'Masa delgada'],
      variantes,
      complementos,
    };
  });
}

// --- Pollo -----------------------------------------------------------------

const POLLO: ItemPropuesto[] = [
  {
    clave: 'muslo-y-cuarto',
    nombre: 'Muslo y cuarto',
    variantes: [
      { producto: '04002', opciones: { [ACOMPANAMIENTO]: 'Ceviche' } },
      { producto: '04004', opciones: { [ACOMPANAMIENTO]: 'Papas fritas' } },
      { producto: '04006', opciones: { [ACOMPANAMIENTO]: 'Papas agrandadas' } },
    ],
  },
  {
    clave: 'pechuga-y-ala',
    nombre: 'Pechuga y ala',
    variantes: [
      { producto: '04008', opciones: { [ACOMPANAMIENTO]: 'Ceviche' } },
      { producto: '04010', opciones: { [ACOMPANAMIENTO]: 'Papas fritas' } },
      { producto: '04012', opciones: { [ACOMPANAMIENTO]: 'Papas agrandadas' } },
    ],
  },
  {
    clave: 'tres-piezas',
    nombre: 'Tres piezas con papas',
    variantes: [
      { producto: '04014', opciones: { Piezas: '2 cuartos y 1 muslo', Papas: 'Normales' } },
      { producto: '04022', opciones: { Piezas: '2 cuartos y 1 muslo', Papas: 'Agrandadas' } },
      { producto: '04016', opciones: { Piezas: '2 muslos y 1 cuarto', Papas: 'Normales' } },
      { producto: '04024', opciones: { Piezas: '2 muslos y 1 cuarto', Papas: 'Agrandadas' } },
      { producto: '04018', opciones: { Piezas: 'Pechuga y cuarto', Papas: 'Normales' } },
      { producto: '04026', opciones: { Piezas: 'Pechuga y cuarto', Papas: 'Agrandadas' } },
      { producto: '04020', opciones: { Piezas: 'Pechuga y muslo', Papas: 'Normales' } },
      { producto: '04028', opciones: { Piezas: 'Pechuga y muslo', Papas: 'Agrandadas' } },
    ],
  },
  {
    clave: 'alitas',
    nombre: 'Orden de 4 alitas',
    variantes: [
      { producto: '04030', opciones: { Papas: 'Normales' } },
      { producto: '04032', opciones: { Papas: 'Agrandadas' } },
    ],
  },
  {
    clave: 'pollo-asado',
    nombre: 'Pollo asado',
    variantes: [
      { producto: '04042', opciones: { Porción: 'Entero' } },
      { producto: '04044', opciones: { Porción: 'Medio' } },
      { producto: '04046', opciones: { Porción: 'Cuarto' } },
    ],
  },
  {
    clave: 'pieza-suelta',
    nombre: 'Pieza suelta',
    variantes: [
      { producto: '04048', opciones: { Pieza: 'Muslo' } },
      { producto: '04050', opciones: { Pieza: 'Cuarto' } },
      { producto: '04052', opciones: { Pieza: 'Alita' } },
    ],
  },
  { clave: 'frito-ensalada', nombre: 'Porción de frito con ensalada', variantes: [{ producto: '04054', opciones: {} }] },
  { clave: 'asado-ensalada', nombre: 'Porción de asado con ensalada', variantes: [{ producto: '04064', opciones: {} }] },
  { clave: 'nuggets', nombre: 'Nuggets', variantes: [{ producto: '045002', opciones: {} }] },
];

// --- Parrilla --------------------------------------------------------------

const PARRILLA: ItemPropuesto[] = [
  { clave: 'costilla-cerdo', nombre: 'Costilla de cerdo', variantes: [{ producto: '04062', opciones: {} }] },
  { clave: 'pechuga-plancha', nombre: 'Pechuga a la plancha', variantes: [{ producto: '04060', opciones: {} }] },
];

// --- Hamburguesas y sandwiches ---------------------------------------------

const EXTRAS_HAMBURGUESA: ComplementoPropuesta[] = [
  { producto: '05019', etiqueta: 'Extra huevo', maximo: 3 },
  { producto: '05021', etiqueta: 'Extra frijol', maximo: 3 },
  { producto: '05023', etiqueta: 'Extra jamón', maximo: 3 },
  { producto: '05025', etiqueta: 'Extra carne mechada', maximo: 3 },
  { producto: '05027', etiqueta: 'Extra tocineta', maximo: 3 },
];

const NOTAS_HAMBURGUESA = ['Sin cebolla', 'Sin pepinillos'];

const HAMBURGUESAS: ItemPropuesto[] = [
  { clave: 'hamburguesa-estacion', nombre: 'Hamburguesa Estación', notasRapidas: NOTAS_HAMBURGUESA, variantes: [{ producto: '05002', opciones: {} }], complementos: EXTRAS_HAMBURGUESA },
  { clave: 'hamburguesa-super', nombre: 'Hamburguesa Súper Estación', notasRapidas: NOTAS_HAMBURGUESA, variantes: [{ producto: '05004', opciones: {} }], complementos: EXTRAS_HAMBURGUESA },
  { clave: 'hamburguesa-doble', nombre: 'Hamburguesa Doble Torta', notasRapidas: NOTAS_HAMBURGUESA, variantes: [{ producto: '05006', opciones: {} }], complementos: EXTRAS_HAMBURGUESA },
  {
    clave: 'hamburguesa-pollo',
    nombre: 'Hamburguesa Estación de Pollo',
    notasRapidas: NOTAS_HAMBURGUESA,
    variantes: [
      { producto: '05037', opciones: { [TAMANO]: 'Sencilla' } },
      { producto: '05040', opciones: { [TAMANO]: 'Doble' } },
    ],
    complementos: EXTRAS_HAMBURGUESA,
  },
  { clave: 'sandwich-pollo', nombre: 'Sándwich de pollo', notasRapidas: NOTAS_HAMBURGUESA, variantes: [{ producto: '05008', opciones: {} }], complementos: EXTRAS_HAMBURGUESA },
  { clave: 'sandwich-carne', nombre: 'Sándwich de carne', notasRapidas: NOTAS_HAMBURGUESA, variantes: [{ producto: '05010', opciones: {} }], complementos: EXTRAS_HAMBURGUESA },
  { clave: 'sandwich-jamon-queso', nombre: 'Sándwich de jamón y queso', notasRapidas: NOTAS_HAMBURGUESA, variantes: [{ producto: '05012', opciones: {} }], complementos: EXTRAS_HAMBURGUESA },
  { clave: 'sandwich-vegetariano', nombre: 'Sándwich vegetariano', notasRapidas: NOTAS_HAMBURGUESA, variantes: [{ producto: '05014', opciones: {} }], complementos: EXTRAS_HAMBURGUESA },
  { clave: 'sandwich-pescado', nombre: 'Sándwich de pescado', notasRapidas: NOTAS_HAMBURGUESA, variantes: [{ producto: '058010', opciones: {} }], complementos: EXTRAS_HAMBURGUESA },
  { clave: 'ensalada-pollo', nombre: 'Ensalada de pollo', variantes: [{ producto: '05017', opciones: {} }] },
  { clave: 'ensalada-casa', nombre: 'Ensalada de la casa', variantes: [{ producto: '08009', opciones: {} }] },
];

// --- Combos ----------------------------------------------------------------

const COMBOS: ItemPropuesto[] = [
  { clave: 'combo-1', nombre: 'Combo 1 · 10 piezas de cuartos', variantes: [{ producto: '04034', opciones: {} }] },
  { clave: 'combo-2', nombre: 'Combo 2 · 10 piezas con 1 pechuga', variantes: [{ producto: '04036', opciones: {} }] },
  { clave: 'combo-3', nombre: 'Combo 3 · 6 piezas de cuartos y muslos', variantes: [{ producto: '04038', opciones: {} }] },
  { clave: 'combo-4', nombre: 'Combo 4 · 6 piezas con 1 pechuga', variantes: [{ producto: '04040', opciones: {} }] },
  { clave: 'combo-12-alitas', nombre: 'Combo de 12 alitas', variantes: [{ producto: '5001', opciones: {} }] },
  { clave: 'promo-1', nombre: 'Promo 1 · Familiar, mediana y Coca 2 L', variantes: [{ producto: '01056', opciones: {} }] },
  { clave: 'promo-2', nombre: 'Promo 2 · Papas, familiar, mediana y Coca 2 L', variantes: [{ producto: '01057', opciones: {} }] },
];

export const PROPUESTA_INICIAL: CategoriaPropuesta[] = [
  { id: 'pizzas', nombre: 'Pizzas', items: pizzas() },
  { id: 'pollo', nombre: 'Pollo', items: POLLO },
  { id: 'parrilla', nombre: 'Parrilla', items: PARRILLA },
  { id: 'hamburguesas', nombre: 'Hamburguesas y sándwiches', items: HAMBURGUESAS },
  { id: 'combos', nombre: 'Combos y promos', items: COMBOS },
];
