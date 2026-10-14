/**
 * El menu del POS, copiado a la nube.
 *
 * COMO LLEGA
 *
 * Igual que los pedidos y los clientes: el agente del local lo lee del POS y lo
 * manda firmado. La app de los clientes lee ESTA copia, nunca el POS.
 *
 * ES UNA COPIA
 *
 * Si la caja cambia un precio, el proximo envio lo cambia aqui. Un producto
 * que desaparece del POS no se borra: se marca como no presente, porque los
 * pedidos viejos lo mencionan.
 *
 * LO UNICO NUESTRO es ocultoPorDueno: el agente nunca lo toca.
 */

import { prisma } from '@/lib/db/prisma';
import { esOfrecible } from '@/lib/menu/reglas';
import { aCentimos } from '@/lib/money/money';
import { ErrorNegocio } from '@/server/errores';

export interface GrupoDelPos {
  /** idgrupo del POS. Los ceros de adelante son parte de la clave. */
  clave: string;
  nombre?: string | null;
  clasificacion?: number | null;
}

export interface ProductoDelPos {
  /** idproducto del POS. Los ceros de adelante son parte de la clave. */
  clave: string;
  nombre?: string | null;
  grupo?: string | null;
  area?: string | null;
  /** En colones, con impuesto, como lo guarda el POS (puede traer 9950.0001). */
  precio?: number | null;
  impuesto?: number | null;
  paraDomicilio?: boolean | null;
  bloqueado?: boolean | null;
  precioAbierto?: boolean | null;
}

export interface EnvioDeMenu {
  grupos: GrupoDelPos[];
  productos: ProductoDelPos[];
  /**
   * true = esto es TODO el catalogo. Lo que no venga se marca como no presente.
   * false = es un pedazo y no se retira nada.
   */
  completo?: boolean;
}

export interface ResultadoDeMenu {
  grupos: number;
  productos: number;
  nuevos: number;
  actualizados: number;
  sinCambio: number;
  retirados: number;
  rechazados: Array<{ clave: string; motivo: string }>;
}

const MAX_GRUPOS = 200;
const MAX_PRODUCTOS = 3000;
const LARGO_CLAVE = 30;

interface DatosDeProducto {
  grupoId: string | null;
  nombre: string;
  areaId: string | null;
  precio: number;
  impuesto: number;
  paraDomicilio: boolean;
  bloqueado: boolean;
  precioAbierto: boolean;
}

function limpiarClave(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const c = valor.trim();
  if (c === '' || c.length > LARGO_CLAVE) return null;
  return c;
}

function entero(valor: unknown, desde: number, hasta: number, porDefecto: number): number {
  const n = typeof valor === 'number' ? Math.round(valor) : Number.NaN;
  return Number.isFinite(n) && n >= desde && n <= hasta ? n : porDefecto;
}

/** Guarda el menu que mando el agente. Idempotente: repetirlo no cambia nada. */
export async function sincronizarMenu(envio: EnvioDeMenu): Promise<ResultadoDeMenu> {
  if (!envio || !Array.isArray(envio.grupos) || !Array.isArray(envio.productos)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El envio no trae grupos y productos.');
  }
  if (envio.grupos.length > MAX_GRUPOS) {
    throw new ErrorNegocio('DATOS_INVALIDOS', `Maximo ${MAX_GRUPOS} grupos por envio.`);
  }
  if (envio.productos.length > MAX_PRODUCTOS) {
    throw new ErrorNegocio('DATOS_INVALIDOS', `Maximo ${MAX_PRODUCTOS} productos por envio.`);
  }

  const resultado: ResultadoDeMenu = {
    grupos: 0,
    productos: 0,
    nuevos: 0,
    actualizados: 0,
    sinCambio: 0,
    retirados: 0,
    rechazados: [],
  };

  // --- Grupos ---------------------------------------------------------------
  const grupos = new Map<string, { nombre: string; clasificacion: number }>();
  for (const g of envio.grupos) {
    const clave = limpiarClave(g?.clave);
    if (!clave) {
      resultado.rechazados.push({
        clave: String(g?.clave ?? '(vacia)'),
        motivo: 'grupo sin clave valida',
      });
      continue;
    }
    grupos.set(clave, {
      nombre: (g.nombre ?? '').trim() || clave,
      clasificacion: entero(g.clasificacion, 1, 3, 3),
    });
  }

  // --- Productos ------------------------------------------------------------
  const productos = new Map<string, DatosDeProducto>();
  for (const p of envio.productos) {
    const clave = limpiarClave(p?.clave);
    if (!clave) {
      resultado.rechazados.push({
        clave: String(p?.clave ?? '(vacia)'),
        motivo: 'producto sin clave valida',
      });
      continue;
    }
    const valor = p.precio;
    if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) {
      resultado.rechazados.push({ clave, motivo: 'precio invalido' });
      continue;
    }
    productos.set(clave, {
      grupoId: limpiarClave(p.grupo ?? ''),
      nombre: (p.nombre ?? '').trim() || clave,
      areaId: limpiarClave(p.area ?? ''),
      precio: aCentimos(valor),
      impuesto: entero(p.impuesto, 0, 100, 13),
      paraDomicilio: p.paraDomicilio === true,
      bloqueado: p.bloqueado === true,
      precioAbierto: p.precioAbierto === true,
    });
  }

  // Un producto que apunta a un grupo que no existe se guarda sin grupo antes que
  // perderlo: el grupo puede venir en otro pedazo del envio.
  const gruposConocidos = new Set(
    (await prisma.grupoMenu.findMany({ select: { id: true } })).map((g) => g.id),
  );
  for (const k of grupos.keys()) gruposConocidos.add(k);
  for (const [clave, p] of productos) {
    if (p.grupoId !== null && !gruposConocidos.has(p.grupoId)) {
      productos.set(clave, { ...p, grupoId: null });
    }
  }

  // --- Grupos: crear los nuevos, actualizar los que cambiaron -----------------
  const previosG = new Map((await prisma.grupoMenu.findMany()).map((g) => [g.id, g] as const));
  for (const [id, g] of grupos) {
    const antes = previosG.get(id);
    if (!antes) {
      await prisma.grupoMenu.create({ data: { id, ...g } });
    } else if (
      antes.nombre !== g.nombre ||
      antes.clasificacion !== g.clasificacion ||
      !antes.presente
    ) {
      await prisma.grupoMenu.update({ where: { id }, data: { ...g, presente: true } });
    }
    resultado.grupos += 1;
  }

  // --- Productos --------------------------------------------------------------
  const previos = new Map((await prisma.productoMenu.findMany()).map((p) => [p.id, p] as const));
  const crear: Array<{ id: string } & DatosDeProducto> = [];
  const cambiar: Array<{ id: string; datos: DatosDeProducto }> = [];
  for (const [id, p] of productos) {
    const antes = previos.get(id);
    resultado.productos += 1;
    if (!antes) {
      crear.push({ id, ...p });
      continue;
    }
    const igual =
      antes.nombre === p.nombre &&
      antes.grupoId === p.grupoId &&
      antes.areaId === p.areaId &&
      antes.precio === p.precio &&
      antes.impuesto === p.impuesto &&
      antes.paraDomicilio === p.paraDomicilio &&
      antes.bloqueado === p.bloqueado &&
      antes.precioAbierto === p.precioAbierto &&
      antes.presente;
    if (igual) resultado.sinCambio += 1;
    else cambiar.push({ id, datos: p });
  }

  if (crear.length > 0) {
    await prisma.productoMenu.createMany({ data: crear, skipDuplicates: true });
    resultado.nuevos = crear.length;
  }
  const TANDA = 50;
  for (let i = 0; i < cambiar.length; i += TANDA) {
    await prisma.$transaction(
      cambiar.slice(i, i + TANDA).map((c) =>
        prisma.productoMenu.update({
          where: { id: c.id },
          data: { ...c.datos, presente: true, sincronizadoEn: new Date() },
        }),
      ),
    );
  }
  resultado.actualizados = cambiar.length;

  // --- Lo que ya no esta en el POS --------------------------------------------
  if (envio.completo === true) {
    const retirados = await prisma.productoMenu.updateMany({
      where: { presente: true, id: { notIn: [...productos.keys()] } },
      data: { presente: false },
    });
    resultado.retirados = retirados.count;
    await prisma.grupoMenu.updateMany({
      where: { presente: true, id: { notIn: [...grupos.keys()] } },
      data: { presente: false },
    });
  }

  return resultado;
}

export interface ProductoDelMenu {
  id: string;
  nombre: string;
  /** Centimos, con impuesto. */
  precio: number;
  areaId: string | null;
}

export interface GrupoDelMenu {
  id: string;
  nombre: string;
  clasificacion: number;
  productos: ProductoDelMenu[];
}

/** El menu tal como lo ve un cliente: solo lo que se puede pedir. */
export async function menuParaLaApp(): Promise<GrupoDelMenu[]> {
  const filas = await prisma.productoMenu.findMany({
    where: { presente: true, paraDomicilio: true, bloqueado: false, ocultoPorDueno: false },
    include: { grupo: true },
    orderBy: { id: 'asc' },
  });

  const porGrupo = new Map<string, GrupoDelMenu>();
  for (const p of filas) {
    if (!esOfrecible(p)) continue;
    const gid = p.grupoId ?? '';
    let g = porGrupo.get(gid);
    if (!g) {
      g = {
        id: gid,
        nombre: p.grupo?.nombre ?? 'Otros',
        clasificacion: p.grupo?.clasificacion ?? 3,
        productos: [],
      };
      porGrupo.set(gid, g);
    }
    g.productos.push({ id: p.id, nombre: p.nombre, precio: p.precio, areaId: p.areaId });
  }
  return [...porGrupo.values()].sort((a, b) => a.id.localeCompare(b.id));
}
