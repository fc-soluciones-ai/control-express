/**
 * Los pedidos de la app de clientes.
 *
 * LO QUE MANDA EL TELEFONO NO SE CREE
 *
 * El telefono dice que plato, que variante, cuantos extras. NUNCA dice cuanto
 * cuesta: el servidor busca cada variante en el menu, recalcula el precio desde el
 * producto del POS, calcula el envio desde la ubicacion y suma. Un cliente que
 * toque la ruta a mano no puede pagar menos.
 *
 * EL INTERRUPTOR
 *
 * 'pedidos_abiertos' en ajustes_app. Sin fila, esta CERRADO: una app nueva no
 * recibe pedidos hasta que el dueno la abra. Cerrarlo es instantaneo y no afecta
 * lo que ya entro.
 */

import { prisma } from '@/lib/db/prisma';
import { limpiarNota } from '@/lib/menu/carrito';
import {
  precioDeUnidad,
  type ComplementoVista,
  type VarianteVista,
} from '@/lib/menu/estructura';
import { esOfrecible } from '@/lib/menu/reglas';
import {
  CARGO_PLATAFORMA,
  ENVIO_FIJO_DE_PRUEBA,
  MODO_DE_ENVIO_INICIAL,
  comoModoDeEnvio,
  type ModoDeEnvio,
} from '@/lib/pedido/cargos';
import {
  LOCAL,
  MAXIMO_KM,
  TIEMPO_ESTIMADO,
  TRAMOS_DE_ENVIO,
  distanciaKm,
  estaEnCostaRica,
  tramoPara,
  type Coordenada,
} from '@/lib/pedido/envio';
import { validarPedido, type LineaEntrante, type PedidoEntrante } from '@/lib/pedido/validar';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';

// ---------------------------------------------------------------------------
// Ajustes y el interruptor de emergencia
// ---------------------------------------------------------------------------

export const AJUSTE_ABIERTO = 'pedidos_abiertos';
export const AJUSTE_SINPE_NUMERO = 'sinpe_numero';
export const AJUSTE_SINPE_NOMBRE = 'sinpe_nombre';
export const AJUSTE_ENVIO_MODO = 'envio_modo';
export const AJUSTE_ENVIO_FIJO = 'envio_fijo_colones';
export const AJUSTE_LOCAL_LAT = 'local_lat';
export const AJUSTE_LOCAL_LNG = 'local_lng';
export const AJUSTE_RADIO_KM = 'radio_km';

export async function leerAjuste(clave: string): Promise<string | null> {
  const fila = await prisma.ajusteApp.findUnique({ where: { clave } });
  return fila?.valor ?? null;
}

export async function guardarAjuste(clave: string, valor: string): Promise<void> {
  await prisma.ajusteApp.upsert({ where: { clave }, create: { clave, valor }, update: { valor } });
}

/** Sin fila, cerrado. Solo el texto exacto 'true' abre. */
export async function pedidosAbiertos(): Promise<boolean> {
  return (await leerAjuste(AJUSTE_ABIERTO)) === 'true';
}

export interface DatosSinpe {
  numero: string;
  nombre: string;
}

/** El SINPE solo se ofrece si el dueno puso el numero. */
export async function datosSinpe(): Promise<DatosSinpe | null> {
  const numero = (await leerAjuste(AJUSTE_SINPE_NUMERO))?.trim();
  if (!numero) return null;
  return { numero, nombre: (await leerAjuste(AJUSTE_SINPE_NOMBRE))?.trim() || 'Pizzería La Estación' };
}

/** Lo que la pantalla del cliente necesita saber antes de empezar. */
export interface InfoDeLaApp {
  abierto: boolean;
  /** Se ofrece SINPE solo si el dueno puso el numero. */
  sinpe: boolean;
  /** Centimos del envio mas barato, para "Envio desde". */
  envioDesde: number | null;
  /** true si el envio es un monto parejo: entonces no es "desde", es el precio. */
  envioFijo: boolean;
}

export async function infoDeLaApp(): Promise<InfoDeLaApp> {
  // Si la base todavia no tiene las tablas de pedidos (un despliegue que llega antes
  // que el cambio de esquema), la pantalla igual carga: sin interruptor, esta CERRADA.
  // Un menu que muestra "cerrado" es mejor que una pagina de error.
  try {
    const [abierto, sinpe, config, primero] = await Promise.all([
      pedidosAbiertos(),
      datosSinpe(),
      configDeEnvio(),
      prisma.productoMenu.findUnique({ where: { id: TRAMOS_DE_ENVIO[0]!.productoMenuId } }),
    ]);
    const fijo = config.modo === 'FIJO';
    return {
      abierto,
      sinpe: sinpe !== null,
      envioDesde: fijo ? config.fijo : primero?.presente ? primero.precio : null,
      envioFijo: fijo,
    };
  } catch (error) {
    console.error('[pedir] no se pudo leer el estado de la app; se muestra cerrada', error);
    return { abierto: false, sinpe: false, envioDesde: null, envioFijo: false };
  }
}

export interface ConfigDeEnvio {
  modo: ModoDeEnvio;
  /** Centimos. Solo cuenta en modo FIJO. */
  fijo: number;
}

/** Como se cobra el envio hoy. Sin ajuste: fijo de pruebas. */
export async function configDeEnvio(): Promise<ConfigDeEnvio> {
  const [modo, fijo] = await Promise.all([leerAjuste(AJUSTE_ENVIO_MODO), leerAjuste(AJUSTE_ENVIO_FIJO)]);
  // Sin ajuste guardado (null) NO es cero colones: Number(null) da 0 y el envio saldria gratis.
  const colones = fijo === null || fijo.trim() === '' ? Number.NaN : Number(fijo);
  return {
    modo: modo === null ? MODO_DE_ENVIO_INICIAL : comoModoDeEnvio(modo),
    fijo: Number.isInteger(colones) && colones >= 0 && colones <= 100_000 ? colones * 100 : ENVIO_FIJO_DE_PRUEBA,
  };
}

/** Cambia como se cobra el envio. Queda en la bitacora. */
export async function fijarConfigDeEnvio(
  modo: ModoDeEnvio,
  fijoEnColones: number,
  cajeroId: string,
): Promise<void> {
  if (!Number.isInteger(fijoEnColones) || fijoEnColones < 0 || fijoEnColones > 100_000) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El envio fijo tiene que ser un monto entero entre 0 y 100.000 colones.');
  }
  const antes = await configDeEnvio();
  await prisma.$transaction(async (tx) => {
    await tx.ajusteApp.upsert({ where: { clave: AJUSTE_ENVIO_MODO }, create: { clave: AJUSTE_ENVIO_MODO, valor: modo }, update: { valor: modo } });
    await tx.ajusteApp.upsert({
      where: { clave: AJUSTE_ENVIO_FIJO },
      create: { clave: AJUSTE_ENVIO_FIJO, valor: String(fijoEnColones) },
      update: { valor: String(fijoEnColones) },
    });
    await registrarEvento(tx, {
      tipo: 'PEDIDO_APP_ESTADO',
      cajeroId,
      entidadTipo: 'AjusteApp',
      entidadId: AJUSTE_ENVIO_MODO,
      antes: { modo: antes.modo, fijo: antes.fijo / 100 },
      despues: { modo, fijo: fijoEnColones },
    });
  });
}

export interface ConfigDeLocal {
  lat: number;
  lng: number;
  /** Hasta cuantos kilometros en linea recta se entrega. */
  radioKm: number;
  /** false mientras sea la ubicacion provisional del codigo y nadie la haya puesto. */
  configurada: boolean;
}

/** Donde esta la pizzeria y hasta donde se entrega. Sin ajuste: el punto provisional. */
export async function configDeLocal(): Promise<ConfigDeLocal> {
  const [lat, lng, radio] = await Promise.all([
    leerAjuste(AJUSTE_LOCAL_LAT),
    leerAjuste(AJUSTE_LOCAL_LNG),
    leerAjuste(AJUSTE_RADIO_KM),
  ]);
  const la = lat === null ? Number.NaN : Number(lat);
  const ln = lng === null ? Number.NaN : Number(lng);
  const r = radio === null ? Number.NaN : Number(radio);
  const configurada = estaEnCostaRica({ lat: la, lng: ln });
  return {
    lat: configurada ? la : LOCAL.lat,
    lng: configurada ? ln : LOCAL.lng,
    radioKm: Number.isFinite(r) && r >= 1 && r <= 100 ? r : MAXIMO_KM,
    configurada,
  };
}

/** Cambia donde esta el local y el radio de entrega. Queda en la bitacora. */
export async function fijarConfigDeLocal(
  punto: Coordenada,
  radioKm: number,
  cajeroId: string,
): Promise<void> {
  if (!estaEnCostaRica(punto)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La ubicacion del local tiene que estar en Costa Rica.');
  }
  if (!Number.isFinite(radioKm) || radioKm < 1 || radioKm > 100) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El radio de entrega tiene que estar entre 1 y 100 kilometros.');
  }
  const antes = await configDeLocal();
  await prisma.$transaction(async (tx) => {
    for (const [clave, valor] of [
      [AJUSTE_LOCAL_LAT, String(punto.lat)],
      [AJUSTE_LOCAL_LNG, String(punto.lng)],
      [AJUSTE_RADIO_KM, String(radioKm)],
    ] as const) {
      await tx.ajusteApp.upsert({ where: { clave }, create: { clave, valor }, update: { valor } });
    }
    await registrarEvento(tx, {
      tipo: 'PEDIDO_APP_ESTADO',
      cajeroId,
      entidadTipo: 'AjusteApp',
      entidadId: AJUSTE_LOCAL_LAT,
      antes: { lat: antes.lat, lng: antes.lng, radioKm: antes.radioKm },
      despues: { lat: punto.lat, lng: punto.lng, radioKm },
    });
  });
}

/** Abre o cierra la recepcion de pedidos. Queda en la bitacora, con quien lo hizo. */
export async function fijarPedidosAbiertos(abierto: boolean, cajeroId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.ajusteApp.upsert({
      where: { clave: AJUSTE_ABIERTO },
      create: { clave: AJUSTE_ABIERTO, valor: abierto ? 'true' : 'false' },
      update: { valor: abierto ? 'true' : 'false' },
    });
    await registrarEvento(tx, {
      tipo: abierto ? 'APP_ABIERTA' : 'APP_CERRADA',
      cajeroId,
      entidadTipo: 'AjusteApp',
      entidadId: AJUSTE_ABIERTO,
    });
  });
}

// ---------------------------------------------------------------------------
// Calcular un pedido
// ---------------------------------------------------------------------------

export interface LineaCalculada {
  varianteId: string;
  productoMenuId: string;
  nombre: string;
  detalle: string;
  cantidad: number;
  /** Centimos de una unidad, SIN extras. */
  precioUnidad: number;
  extras: Array<{ productoMenuId: string; etiqueta: string; cantidad: number; precio: number }>;
  notas: string[];
  /** Centimos de la linea completa: (unidad + extras) x cantidad. */
  totalLinea: number;
}

export interface Cotizacion {
  lineas: LineaCalculada[];
  subtotal: number;
  envio: number;
  /** El producto EXPRESS del POS que se cobra, o null si el envio es fijo de pruebas. */
  envioProductoId: string | null;
  /** El cargo por uso de la plataforma (250 colones). */
  cargoApp: number;
  total: number;
  distanciaKm: number | null;
}

/**
 * Calcula el pedido desde el menu y el POS. Lanza ErrorNegocio con un mensaje
 * que el cliente puede leer si algo no se puede cobrar.
 */
export async function cotizar(
  lineas: LineaEntrante[],
  ubicacion: Coordenada | null,
): Promise<Cotizacion> {
  const ids = [...new Set(lineas.map((l) => l.varianteId))];
  const variantes = await prisma.varianteApp.findMany({
    where: { id: { in: ids } },
    include: { producto: true, item: { include: { categoria: true } } },
  });
  const porId = new Map(variantes.map((v) => [v.id, v] as const));

  const itemIds = [...new Set(variantes.map((v) => v.itemId))];
  const complementosDb = await prisma.complementoApp.findMany({
    where: { itemId: { in: itemIds } },
    include: { producto: true },
  });

  const calculadas: LineaCalculada[] = [];
  let subtotal = 0;

  for (const l of lineas) {
    const v = porId.get(l.varianteId);
    const noDisponible = new ErrorNegocio(
      'DATOS_INVALIDOS',
      'Uno de los platos de tu pedido ya no está disponible. Revisá tu pedido.',
    );
    if (!v || !v.item.activo || !v.item.categoria.activa || !esOfrecible(v.producto)) throw noDisponible;

    const varianteVista: VarianteVista = {
      id: v.id,
      opciones: {},
      precio: v.producto.precio,
      productoMenuId: v.productoMenuId,
    };
    const opciones = v.opciones as Record<string, string>;
    varianteVista.opciones = opciones;

    const complementos: ComplementoVista[] = complementosDb
      .filter((c) => c.itemId === v.itemId && esOfrecible(c.producto))
      .map((c) => ({
        id: c.id,
        etiqueta: c.etiqueta,
        precio: c.producto.precio,
        filtro: c.filtro as Record<string, string>,
        maximo: c.maximo,
        productoMenuId: c.productoMenuId,
      }));

    const unidadConExtras = precioDeUnidad(varianteVista, complementos, l.extras);
    if (unidadConExtras === null) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'Un extra de tu pedido no es válido. Revisá tu pedido.');
    }

    const orden = [...v.item.ejes, ...Object.keys(opciones).filter((k) => !v.item.ejes.includes(k))];
    const detalle = orden.map((e) => opciones[e]).filter(Boolean).join(' · ');

    // Una nota que no es de las rapidas del plato igual se acepta (es texto libre),
    // pero ya viene limpia y corta de validarPedido.
    const notas = l.notas.map(limpiarNota).filter((n) => n !== '');

    const extras = l.extras.map((e) => {
      const c = complementos.find((x) => x.id === e.complementoId)!;
      return { productoMenuId: c.productoMenuId, etiqueta: c.etiqueta, cantidad: e.cantidad, precio: c.precio };
    });

    const totalLinea = unidadConExtras * l.cantidad;
    subtotal += totalLinea;
    calculadas.push({
      varianteId: v.id,
      productoMenuId: v.productoMenuId,
      nombre: v.item.nombre,
      detalle,
      cantidad: l.cantidad,
      precioUnidad: v.producto.precio,
      extras,
      notas,
      totalLinea,
    });
  }

  // --- El envio ---------------------------------------------------------------
  if (!ubicacion) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Necesitamos tu ubicación para calcular el envío.');
  }
  const zona = await calcularZona(ubicacion);
  if (!zona.dentro || zona.envio === null) {
    throw new ErrorNegocio(
      'FUERA_DE_ZONA',
      `Por ahora no llegamos hasta tu ubicación (${zona.km.toFixed(1)} km). Llamanos y vemos.`,
    );
  }

  return {
    lineas: calculadas,
    subtotal,
    envio: zona.envio,
    envioProductoId: zona.envioProductoId,
    cargoApp: CARGO_PLATAFORMA,
    total: subtotal + zona.envio + CARGO_PLATAFORMA,
    distanciaKm: zona.km,
  };
}

interface ZonaCalculada {
  dentro: boolean;
  /** Kilometros en linea recta desde el local, con un decimal. */
  km: number;
  /** Centimos. null si queda fuera. */
  envio: number | null;
  /** El producto EXPRESS que se cobra; null si el envio es fijo o si queda fuera. */
  envioProductoId: string | null;
}

/**
 * Donde cae un punto respecto al local: si llegamos y cuanto cuesta el envio.
 *
 * La ubicacion del local y el radio de entrega salen de los ajustes (los cambia el dueno
 * en /pedidos-app). Dentro del radio, el envio fijo cobra lo mismo a todos; el envio por
 * distancia cobra el producto EXPRESS del tramo y, si el punto cae mas alla del ultimo
 * tramo, tampoco se entrega.
 */
async function calcularZona(ubicacion: Coordenada): Promise<ZonaCalculada> {
  const [local, config] = await Promise.all([configDeLocal(), configDeEnvio()]);
  const centro = { lat: local.lat, lng: local.lng };
  const crudo = distanciaKm(centro, ubicacion);
  const km = Math.round(crudo * 10) / 10;
  const fuera: ZonaCalculada = { dentro: false, km, envio: null, envioProductoId: null };
  if (crudo > local.radioKm) return fuera;

  if (config.modo === 'FIJO') return { dentro: true, km, envio: config.fijo, envioProductoId: null };

  const tramo = tramoPara(ubicacion, centro);
  if (!tramo.dentro) return fuera;
  const producto = await prisma.productoMenu.findUnique({ where: { id: tramo.tramo.productoMenuId } });
  if (!producto || !producto.presente) return fuera;
  return { dentro: true, km, envio: producto.precio, envioProductoId: producto.id };
}

// ---------------------------------------------------------------------------
// La zona: lo que se sabe apenas el cliente marca donde esta
// ---------------------------------------------------------------------------

export interface Zona {
  /** true si llegamos hasta ahi. */
  dentro: boolean;
  /** Kilometros en linea recta desde el local, con un decimal. */
  km: number;
  /** Centimos. null si queda fuera de la zona. */
  envio: number | null;
  cargoApp: number;
  /** Minutos que se le dicen al cliente. */
  tiempo: { desde: number; hasta: number };
}

/**
 * Lo que cuesta el envio y si llegamos, SIN armar un pedido. Es lo que alimenta la
 * cabecera de la app apenas el cliente marca su ubicacion, como en Uber Eats: antes
 * de elegir un solo plato ya sabe cuanto cuesta y cuanto tarda.
 *
 * Fuera de zona no es un error: es una respuesta, y la pantalla la explica.
 */
export async function cotizarZona(ubicacion: Coordenada): Promise<Zona> {
  const z = await calcularZona(ubicacion);
  return { dentro: z.dentro, km: z.km, envio: z.envio, cargoApp: CARGO_PLATAFORMA, tiempo: TIEMPO_ESTIMADO };
}

/** Lo que ve el cliente antes de confirmar: totales y envio, sin guardar nada. */
export async function cotizarDesdeCrudo(crudo: unknown): Promise<Cotizacion> {
  const c = (crudo ?? {}) as { lineas?: unknown; lat?: unknown; lng?: unknown };
  // Se valida con el mismo validador que el pedido, completando lo que no se pide.
  const r = validarPedido({
    clave: 'cotizacion-sin-guardar-0000',
    nombre: 'Cotizacion',
    telefono: '88888888',
    direccion: 'Cotizacion de envio',
    metodoPago: 'EFECTIVO',
    lineas: c.lineas,
    lat: c.lat,
    lng: c.lng,
  });
  if (!r.ok) throw new ErrorNegocio('DATOS_INVALIDOS', r.error);
  const p = r.pedido;
  return cotizar(p.lineas, p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null);
}

// ---------------------------------------------------------------------------
// Crear el pedido
// ---------------------------------------------------------------------------

const VENTANA_MINUTOS = 10;
const MAX_POR_TELEFONO = 3;
const MAX_EN_TOTAL = 80;

export interface PedidoCreado {
  id: string;
  numero: number;
  total: number;
  repetido: boolean;
}

export async function crearPedidoApp(crudo: unknown): Promise<PedidoCreado> {
  if (!(await pedidosAbiertos())) {
    throw new ErrorNegocio(
      'APP_CERRADA',
      'Por ahora no estamos recibiendo pedidos por la app. Llamanos y te atendemos.',
    );
  }

  const r = validarPedido(crudo);
  if (!r.ok) throw new ErrorNegocio('DATOS_INVALIDOS', r.error);
  const p: PedidoEntrante = r.pedido;

  // Reintento del mismo pedido: se devuelve el que ya existe.
  const previo = await prisma.pedidoApp.findUnique({ where: { claveIdempotencia: p.clave } });
  if (previo) return { id: previo.id, numero: previo.numero, total: previo.total, repetido: true };

  // Freno contra abuso: la ruta es publica.
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60_000);
  const [delTelefono, enTotal] = await Promise.all([
    prisma.pedidoApp.count({ where: { telefono: p.telefono, createdAt: { gte: desde } } }),
    prisma.pedidoApp.count({ where: { createdAt: { gte: desde } } }),
  ]);
  if (delTelefono >= MAX_POR_TELEFONO || enTotal >= MAX_EN_TOTAL) {
    throw new ErrorNegocio('DEMASIADOS_PEDIDOS', 'Estamos recibiendo muchos pedidos. Probá de nuevo en unos minutos.');
  }

  const cot = await cotizar(p.lineas, p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null);

  // --- El pago --------------------------------------------------------------
  if (p.metodoPago === 'TARJETA') {
    throw new ErrorNegocio('PAGO_NO_DISPONIBLE', 'El pago con tarjeta todavía no está disponible.');
  }
  if (p.metodoPago === 'SINPE' && !(await datosSinpe())) {
    throw new ErrorNegocio('PAGO_NO_DISPONIBLE', 'El pago con SINPE todavía no está disponible.');
  }
  if (p.metodoPago === 'EFECTIVO' && p.pagaCon !== null && p.pagaCon < cot.total) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Con ese monto no alcanza para pagar el total.');
  }

  // La ficha del cliente, si el telefono calza con una y es la unica.
  const fichas = await prisma.cliente.findMany({ where: { telefono: p.telefono }, select: { id: true }, take: 2 });
  const clienteId = fichas.length === 1 ? fichas[0]!.id : null;

  try {
    const creado = await prisma.pedidoApp.create({
      data: {
        claveIdempotencia: p.clave,
        nombre: p.nombre,
        telefono: p.telefono,
        clienteId,
        direccion: p.direccion,
        referencia: p.referencia,
        latitud: p.lat,
        longitud: p.lng,
        precisionM: p.precisionM,
        distanciaKm: cot.distanciaKm,
        metodoPago: p.metodoPago,
        pagaCon: p.metodoPago === 'EFECTIVO' ? p.pagaCon : null,
        referenciaPago: p.metodoPago === 'SINPE' ? p.referenciaPago : null,
        subtotal: cot.subtotal,
        envio: cot.envio,
        cargoApp: cot.cargoApp,
        total: cot.total,
        nota: p.nota,
        lineas: {
          create: [
            ...cot.lineas.map((l) => ({
              productoMenuId: l.productoMenuId,
              nombre: l.nombre,
              detalle: l.detalle,
              cantidad: l.cantidad,
              precioUnidad: l.precioUnidad,
              extras: l.extras,
              notas: l.notas,
            })),
          ],
        },
      },
    });
    return { id: creado.id, numero: creado.numero, total: creado.total, repetido: false };
  } catch (error) {
    // Dos envios casi simultaneos con la misma clave: gana el primero.
    const otra = await prisma.pedidoApp.findUnique({ where: { claveIdempotencia: p.clave } });
    if (otra) return { id: otra.id, numero: otra.numero, total: otra.total, repetido: true };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Ver y mover pedidos
// ---------------------------------------------------------------------------

export const ESTADOS_DE_PEDIDO_APP = [
  'NUEVO',
  'ACEPTADO',
  'EN_COCINA',
  'EN_CAMINO',
  'ENTREGADO',
  'CANCELADO',
] as const;
export type EstadoDePedidoApp = (typeof ESTADOS_DE_PEDIDO_APP)[number];

/** A que estados se puede pasar desde cada uno. Un pedido cerrado no se reabre. */
const TRANSICIONES: Record<EstadoDePedidoApp, EstadoDePedidoApp[]> = {
  NUEVO: ['ACEPTADO', 'CANCELADO'],
  ACEPTADO: ['EN_COCINA', 'CANCELADO'],
  EN_COCINA: ['EN_CAMINO', 'CANCELADO'],
  EN_CAMINO: ['ENTREGADO', 'CANCELADO'],
  ENTREGADO: [],
  CANCELADO: [],
};

export function transicionPermitida(de: string, a: string): boolean {
  return (TRANSICIONES[de as EstadoDePedidoApp] ?? []).includes(a as EstadoDePedidoApp);
}

export interface PedidoParaElCliente {
  numero: number;
  estado: EstadoDePedidoApp;
  nombre: string;
  direccion: string;
  metodoPago: string;
  subtotal: number;
  envio: number;
  cargoApp: number;
  total: number;
  pagaCon: number | null;
  creadoEn: string;
  lineas: Array<{ nombre: string; detalle: string; cantidad: number; extras: string[]; notas: string[] }>;
  ubicacion: Coordenada | null;
}

/** El seguimiento que ve el cliente. Se busca por el id largo, que no se adivina. */
export async function pedidoParaElCliente(id: string): Promise<PedidoParaElCliente | null> {
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return null;
  const p = await prisma.pedidoApp.findUnique({ where: { id }, include: { lineas: true } });
  if (!p) return null;
  return {
    numero: p.numero,
    estado: p.estado as EstadoDePedidoApp,
    nombre: p.nombre,
    direccion: p.direccion,
    metodoPago: p.metodoPago,
    subtotal: p.subtotal,
    envio: p.envio,
    cargoApp: p.cargoApp,
    total: p.total,
    pagaCon: p.pagaCon,
    creadoEn: p.createdAt.toISOString(),
    lineas: p.lineas.map((l) => ({
      nombre: l.nombre,
      detalle: l.detalle,
      cantidad: l.cantidad,
      extras: (l.extras as Array<{ etiqueta: string; cantidad: number }>).map(
        (e) => `${e.cantidad > 1 ? `${e.cantidad} × ` : ''}${e.etiqueta}`,
      ),
      notas: l.notas,
    })),
    ubicacion: p.latitud !== null && p.longitud !== null ? { lat: p.latitud, lng: p.longitud } : null,
  };
}

export interface PedidoParaElLocal {
  id: string;
  numero: number;
  estado: EstadoDePedidoApp;
  nombre: string;
  telefono: string;
  direccion: string;
  referencia: string | null;
  ubicacion: Coordenada | null;
  precisionM: number | null;
  distanciaKm: number | null;
  metodoPago: string;
  pagaCon: number | null;
  referenciaPago: string | null;
  pagoVerificado: boolean;
  subtotal: number;
  envio: number;
  cargoApp: number;
  total: number;
  nota: string | null;
  creadoEn: string;
  repartidor: RepartidorDeLaApp | null;
  lineas: Array<{ nombre: string; detalle: string; cantidad: number; extras: string[]; notas: string[] }>;
}

/** Quien puede llevar un pedido: un chofer activo y la moto que anda hoy (si tiene). */
export interface RepartidorDeLaApp {
  id: string;
  nombre: string;
  placa: string | null;
}

/** Los pedidos de la app de las ultimas horas, los mas nuevos primero. */
export async function pedidosParaElLocal(horas = 24): Promise<PedidoParaElLocal[]> {
  const desde = new Date(Date.now() - horas * 3_600_000);
  const filas = await prisma.pedidoApp.findMany({
    where: { createdAt: { gte: desde } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      lineas: true,
      chofer: { include: { asignaciones: { where: { fechaFin: null }, select: { placa: true } } } },
    },
  });
  return filas.map((p) => ({
    id: p.id,
    numero: p.numero,
    estado: p.estado as EstadoDePedidoApp,
    nombre: p.nombre,
    telefono: p.telefono,
    direccion: p.direccion,
    referencia: p.referencia,
    ubicacion: p.latitud !== null && p.longitud !== null ? { lat: p.latitud, lng: p.longitud } : null,
    precisionM: p.precisionM,
    distanciaKm: p.distanciaKm,
    metodoPago: p.metodoPago,
    pagaCon: p.pagaCon,
    referenciaPago: p.referenciaPago,
    pagoVerificado: p.pagoVerificado,
    subtotal: p.subtotal,
    envio: p.envio,
    cargoApp: p.cargoApp,
    total: p.total,
    nota: p.nota,
    creadoEn: p.createdAt.toISOString(),
    repartidor: p.chofer
      ? { id: p.chofer.id, nombre: p.chofer.nombre, placa: p.chofer.asignaciones[0]?.placa ?? null }
      : null,
    lineas: p.lineas.map((l) => ({
      nombre: l.nombre,
      detalle: l.detalle,
      cantidad: l.cantidad,
      extras: (l.extras as Array<{ etiqueta: string; cantidad: number }>).map(
        (e) => `${e.cantidad > 1 ? `${e.cantidad} × ` : ''}${e.etiqueta}`,
      ),
      notas: l.notas,
    })),
  }));
}

/** Los choferes activos con la moto que tienen asignada hoy, para elegir a quien le toca un pedido. */
export async function repartidoresDeLaApp(): Promise<RepartidorDeLaApp[]> {
  const choferes = await prisma.chofer.findMany({
    where: { estado: 'ACTIVO' },
    orderBy: { nombre: 'asc' },
    include: { asignaciones: { where: { fechaFin: null }, select: { placa: true } } },
  });
  return choferes.map((c) => ({ id: c.id, nombre: c.nombre, placa: c.asignaciones[0]?.placa ?? null }));
}

/**
 * Le da el pedido a un repartidor (o se lo quita con null). No cambia el estado: se puede
 * asignar antes de que salga de cocina. Un pedido ya entregado o cancelado no se reasigna.
 */
export async function asignarRepartidorAPedidoApp(
  id: string,
  choferId: string | null,
  cajeroId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.pedidoApp.findUnique({ where: { id } });
    if (!p) throw new ErrorNegocio('PEDIDO_NO_ENCONTRADO', 'No se encontró el pedido.');
    if (p.estado === 'ENTREGADO' || p.estado === 'CANCELADO') {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'Un pedido cerrado ya no se reasigna.');
    }
    if (choferId !== null) {
      const chofer = await tx.chofer.findUnique({ where: { id: choferId } });
      if (!chofer) throw new ErrorNegocio('CHOFER_NO_ENCONTRADO', 'No se encontró el repartidor.');
      if (chofer.estado !== 'ACTIVO') throw new ErrorNegocio('CHOFER_INACTIVO', 'Ese repartidor está inactivo.');
    }
    if (p.choferId === choferId) return;
    await tx.pedidoApp.update({ where: { id }, data: { choferId } });
    await registrarEvento(tx, {
      tipo: 'PEDIDO_APP_ESTADO',
      cajeroId,
      entidadTipo: 'PedidoApp',
      entidadId: id,
      antes: { choferId: p.choferId },
      despues: { choferId },
    });
  });
}

/** Cambia el estado de un pedido, respetando las transiciones. Queda en la bitacora. */
export async function cambiarEstadoDePedidoApp(
  id: string,
  nuevo: EstadoDePedidoApp,
  cajeroId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.pedidoApp.findUnique({ where: { id } });
    if (!p) throw new ErrorNegocio('PEDIDO_NO_ENCONTRADO', 'No se encontró el pedido.');
    if (!transicionPermitida(p.estado, nuevo)) {
      throw new ErrorNegocio('DATOS_INVALIDOS', `Un pedido ${p.estado.toLowerCase()} no puede pasar a ${nuevo.toLowerCase()}.`);
    }
    await tx.pedidoApp.update({ where: { id }, data: { estado: nuevo } });
    await registrarEvento(tx, {
      tipo: 'PEDIDO_APP_ESTADO',
      cajeroId,
      entidadTipo: 'PedidoApp',
      entidadId: id,
      antes: { estado: p.estado },
      despues: { estado: nuevo },
    });
  });
}

/** Marca que alguien del local confirmo que el SINPE llego. */
export async function verificarPagoDePedidoApp(id: string, cajeroId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.pedidoApp.findUnique({ where: { id } });
    if (!p) throw new ErrorNegocio('PEDIDO_NO_ENCONTRADO', 'No se encontró el pedido.');
    await tx.pedidoApp.update({ where: { id }, data: { pagoVerificado: true } });
    await registrarEvento(tx, {
      tipo: 'PEDIDO_APP_ESTADO',
      cajeroId,
      entidadTipo: 'PedidoApp',
      entidadId: id,
      antes: { pagoVerificado: false },
      despues: { pagoVerificado: true },
    });
  });
}
