/**
 * El menu de la app: lo que ve el cliente, armado sobre los productos del POS.
 *
 * Ver docs/MENU-DE-LA-APP.md. Cada plato apunta a productos del POS y el precio
 * se lee de ahi, nunca se guarda aqui.
 */

import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import {
  precioDesde,
  type ComplementoVista,
  type ItemVista,
  type Opciones,
  type VarianteVista,
} from '@/lib/menu/estructura';
import { PROPUESTA_INICIAL, type CategoriaPropuesta } from '@/lib/menu/propuesta-inicial';
import { esOfrecible } from '@/lib/menu/reglas';

export interface ItemDelMenu extends ItemVista {
  /** Centimos del tamano o variante mas barata. */
  desde: number;
}

export interface CategoriaDelMenu {
  id: string;
  nombre: string;
  items: ItemDelMenu[];
}

function comoOpciones(valor: Prisma.JsonValue): Opciones {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const salida: Opciones = {};
  for (const [k, v] of Object.entries(valor)) {
    if (typeof v === 'string') salida[k] = v;
  }
  return salida;
}

/**
 * El menu tal como lo ve un cliente: categorias activas, platos activos, y de cada
 * plato solo las variantes y extras cuyo producto del POS se puede ofrecer hoy.
 * Un plato sin ninguna variante ofrecible no aparece.
 */
export async function menuDeLaApp(): Promise<CategoriaDelMenu[]> {
  const categorias = await prisma.categoriaApp.findMany({
    where: { activa: true },
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    include: {
      items: {
        where: { activo: true },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
        include: {
          variantes: { orderBy: { orden: 'asc' }, include: { producto: true } },
          complementos: { orderBy: { orden: 'asc' }, include: { producto: true } },
        },
      },
    },
  });

  const salida: CategoriaDelMenu[] = [];
  for (const c of categorias) {
    const items: ItemDelMenu[] = [];
    for (const i of c.items) {
      const variantes: VarianteVista[] = i.variantes
        .filter((v) => esOfrecible(v.producto))
        .map((v) => ({
          id: v.id,
          opciones: comoOpciones(v.opciones),
          precio: v.producto.precio,
          productoMenuId: v.productoMenuId,
        }));
      if (variantes.length === 0) continue;

      const complementos: ComplementoVista[] = i.complementos
        .filter((x) => esOfrecible(x.producto))
        .map((x) => ({
          id: x.id,
          etiqueta: x.etiqueta,
          precio: x.producto.precio,
          filtro: comoOpciones(x.filtro),
          maximo: x.maximo,
          productoMenuId: x.productoMenuId,
        }));

      items.push({
        id: i.id,
        clave: i.clave,
        categoriaId: i.categoriaId,
        nombre: i.nombre,
        descripcion: i.descripcion,
        ejes: i.ejes,
        notasRapidas: i.notasRapidas,
        variantes,
        complementos,
        desde: precioDesde(variantes),
      });
    }
    if (items.length > 0) salida.push({ id: c.id, nombre: c.nombre, items });
  }
  return salida;
}

export interface ResultadoDePropuesta {
  categorias: number;
  items: number;
  variantes: number;
  complementos: number;
  /** Productos que la propuesta menciona y el POS no tiene (o no son de domicilio). */
  faltantes: string[];
}

/**
 * Carga la propuesta inicial. Solo AGREGA: lo que ya existe (aunque el dueno lo haya
 * renombrado, ocultado o reordenado) no se toca. Es seguro correrla otra vez, por
 * ejemplo cuando se suma un producto nuevo a la propuesta.
 *
 * Se compara en memoria y se escribe por lotes: la propuesta trae unos cuatrocientos
 * extras y hacerlo de uno en uno son cientos de viajes a la base.
 */
export async function aplicarPropuestaInicial(
  propuesta: CategoriaPropuesta[] = PROPUESTA_INICIAL,
): Promise<ResultadoDePropuesta> {
  const resultado: ResultadoDePropuesta = {
    categorias: 0,
    items: 0,
    variantes: 0,
    complementos: 0,
    faltantes: [],
  };

  const productos = new Map(
    (await prisma.productoMenu.findMany({ select: { id: true, presente: true, paraDomicilio: true } })).map(
      (p) => [p.id, p] as const,
    ),
  );
  const existe = (id: string): boolean => {
    const p = productos.get(id);
    return p !== undefined && p.presente && p.paraDomicilio;
  };
  const faltantes = new Set<string>();

  // Lo que ya hay.
  const categoriasHay = new Set((await prisma.categoriaApp.findMany({ select: { id: true } })).map((c) => c.id));
  const itemsHay = new Map(
    (await prisma.itemApp.findMany({ select: { id: true, clave: true } })).map((i) => [i.clave, i.id] as const),
  );
  const variantesHay = new Set(
    (await prisma.varianteApp.findMany({ select: { itemId: true, productoMenuId: true } })).map(
      (v) => `${v.itemId}|${v.productoMenuId}`,
    ),
  );
  const complementosHay = new Set(
    (await prisma.complementoApp.findMany({ select: { itemId: true, productoMenuId: true } })).map(
      (c) => `${c.itemId}|${c.productoMenuId}`,
    ),
  );

  const categoriasNuevas: Prisma.CategoriaAppCreateManyInput[] = [];
  const itemsNuevos: Prisma.ItemAppCreateManyInput[] = [];
  const variantesNuevas: Prisma.VarianteAppCreateManyInput[] = [];
  const complementosNuevos: Prisma.ComplementoAppCreateManyInput[] = [];

  let ordenCategoria = 0;
  for (const cat of propuesta) {
    ordenCategoria += 10;
    if (!categoriasHay.has(cat.id)) {
      categoriasNuevas.push({ id: cat.id, nombre: cat.nombre, orden: ordenCategoria });
      categoriasHay.add(cat.id);
    }

    let ordenItem = 0;
    for (const it of cat.items) {
      ordenItem += 10;
      const validas = it.variantes.filter((v) => {
        if (existe(v.producto)) return true;
        faltantes.add(v.producto);
        return false;
      });
      if (validas.length === 0) continue;

      let itemId = itemsHay.get(it.clave);
      if (!itemId) {
        itemId = randomUUID();
        itemsHay.set(it.clave, itemId);
        itemsNuevos.push({
          id: itemId,
          clave: it.clave,
          categoriaId: cat.id,
          nombre: it.nombre,
          descripcion: it.descripcion ?? null,
          orden: ordenItem,
          ejes: Object.keys(validas[0]!.opciones),
          notasRapidas: it.notasRapidas ?? [],
        });
      }

      let ordenVariante = 0;
      for (const v of validas) {
        ordenVariante += 10;
        const llave = `${itemId}|${v.producto}`;
        if (variantesHay.has(llave)) continue;
        variantesHay.add(llave);
        variantesNuevas.push({ itemId, productoMenuId: v.producto, opciones: v.opciones, orden: ordenVariante });
      }

      let ordenComplemento = 0;
      for (const c of it.complementos ?? []) {
        ordenComplemento += 10;
        if (!existe(c.producto)) {
          faltantes.add(c.producto);
          continue;
        }
        const llave = `${itemId}|${c.producto}`;
        if (complementosHay.has(llave)) continue;
        complementosHay.add(llave);
        complementosNuevos.push({
          itemId,
          productoMenuId: c.producto,
          etiqueta: c.etiqueta,
          filtro: c.filtro ?? {},
          maximo: c.maximo ?? 3,
          orden: ordenComplemento,
        });
      }
    }
  }

  // Un solo viaje por tabla, en orden: lo de abajo depende de lo de arriba.
  await prisma.$transaction([
    prisma.categoriaApp.createMany({ data: categoriasNuevas, skipDuplicates: true }),
    prisma.itemApp.createMany({ data: itemsNuevos, skipDuplicates: true }),
    prisma.varianteApp.createMany({ data: variantesNuevas, skipDuplicates: true }),
    prisma.complementoApp.createMany({ data: complementosNuevos, skipDuplicates: true }),
  ]);

  resultado.categorias = categoriasNuevas.length;
  resultado.items = itemsNuevos.length;
  resultado.variantes = variantesNuevas.length;
  resultado.complementos = complementosNuevos.length;
  resultado.faltantes = [...faltantes].sort();
  return resultado;
}
