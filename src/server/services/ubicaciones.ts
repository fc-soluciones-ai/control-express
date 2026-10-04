/**
 * Pedir a los clientes su ubicacion por WhatsApp.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * En Costa Rica no hay numero de casa. La direccion de un cliente en el POS es
 * una cadena de referencias escrita por quien contesto el telefono, y en esta
 * base la mitad no sirve: 1.342 estan vacias y 1.744 dicen cosas como
 * "ALAJUELA". El repartidor sale y llama. Un punto en el mapa lo arregla, y
 * quien mejor puede darlo es el cliente desde su propio telefono.
 *
 * COMO FUNCIONA
 *
 * A cada cliente se le arma una solicitud con un enlace propio. El enlace se
 * manda por WhatsApp, el cliente lo abre, el telefono le pide permiso de
 * ubicacion y manda el punto con una nota escrita por el ("porton verde,
 * segundo piso").
 *
 * TRES DECISIONES QUE PARECEN DETALLES Y NO LO SON
 *
 * 1. NADA SE MANDA SOLO. Este modulo no escribe por WhatsApp: arma la lista y
 *    los enlaces. Mandar miles de mensajes no solicitados desde el numero de
 *    la pizzeria lo hace bloquear por Meta, y un mensaje mandado no se puede
 *    recoger. Quien aprieta enviar es una persona.
 *
 * 2. SALE EN TANDAS. Una tanda de 150 por dia se ve como un negocio
 *    atendiendo clientes; 3.535 el mismo martes se ve como spam.
 *
 * 3. LO QUE LLEGA ES UNA PROPUESTA. El punto no reemplaza la direccion
 *    escrita. Entra como PROPUESTA y alguien de la pizzeria la acepta, porque
 *    un cliente puede mandar la ubicacion del trabajo, o del supermercado
 *    donde estaba cuando leyo el mensaje.
 */

import { randomBytes } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db/prisma';
import { primerNombre, telefonoInternacional } from '@/lib/clientes/normalizar';
import { ErrorNegocio } from '@/server/errores';
import { registrarEvento } from '@/server/services/auditoria';
import type { CalidadDireccion, EstadoSolicitud } from '@/types/enums';

/** Cuantos mensajes salen por tanda. Ver la decision 2 del encabezado. */
export const TAMANO_DE_TANDA = 150;

/** Un enlace vale un mes. Despues de eso el cliente ya no se acuerda. */
const DIAS_DE_VIGENCIA = 30;

/**
 * Un punto con mas de este error no sirve para encontrar una casa.
 *
 * Son los metros que el propio telefono dice que puede estar equivocado.
 * Adentro de una casa con el GPS tapado por el techo, un celular reporta
 * tranquilamente 500 metros, que en un barrio es cualquier cuadra.
 */
const PRECISION_MAXIMA_METROS = 100;

/**
 * Costa Rica, con holgura.
 *
 * No es un capricho: si un cliente abre el enlace conectado por una VPN o el
 * navegador le da la ubicacion de la antena, el punto puede caer en otro pais.
 * Mejor rechazarlo que meter una casa en Miami a la lista de reparto.
 */
const LIMITES_CR = { latMin: 8, latMax: 11.3, lonMin: -86, lonMax: -82.5 };

/**
 * El token que va en el enlace.
 *
 * 16 bytes al azar, en base64 de direccion: 22 caracteres que no hay forma de
 * adivinar. No se guarda hasheado, a diferencia del token de sesion, y la
 * razon esta explicada en el esquema: este solo permite proponer una ubicacion
 * para un cliente, y los clientes van a pedir que se les reenvie el enlace.
 */
function nuevoToken(): string {
  return randomBytes(16).toString('base64url');
}

/** La direccion publica de la aplicacion, para armar los enlaces. */
export function direccionPublica(): string {
  const configurada = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configurada) return configurada.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function enlaceDeUbicacion(token: string): string {
  return `${direccionPublica()}/ubicacion/${token}`;
}

/**
 * El mensaje que el cliente va a leer.
 *
 * Dice quien escribe en la primera linea, porque un mensaje de un numero
 * desconocido con un enlace es exactamente como se ve una estafa. Y dice para
 * que sirve, porque el cliente gana algo: que el pedido llegue sin que lo
 * llamen a preguntar donde vive.
 */
export function mensajeParaCliente(nombre: string, enlace: string): string {
  const saludo = primerNombre(nombre);
  return (
    `Hola${saludo ? ` ${saludo}` : ''}, le saludamos de la pizzeria. ` +
    'Estamos mejorando las entregas para que su pedido llegue mas rapido y sin ' +
    'tener que llamarle a preguntar la direccion.\n\n' +
    `Si nos ayuda, abra este enlace y toque "Compartir mi ubicacion": ${enlace}\n\n` +
    'Toma menos de un minuto y solo se usa para llevarle los pedidos. ' +
    'Si prefiere no hacerlo, no hay ningun problema.'
  );
}

/** El enlace que abre WhatsApp con el mensaje ya escrito, listo para enviar. */
export function enlaceWhatsApp(telefono: string, mensaje: string): string {
  return `https://wa.me/${telefonoInternacional(telefono)}?text=${encodeURIComponent(mensaje)}`;
}

// -----------------------------------------------------------------------------
// Armar una tanda
// -----------------------------------------------------------------------------

export interface SolicitudParaEnviar {
  id: string;
  clave: string;
  nombre: string;
  telefono: string;
  direccionActual: string;
  enlace: string;
  mensaje: string;
  enlaceWhatsApp: string;
}

/**
 * Arma la siguiente tanda de solicitudes.
 *
 * Solo entran los clientes en estado LISTO: nombre, celular propio bien
 * escrito y una direccion que ya sirve. Suena al contrario de lo que haria
 * falta (lo urgente son los que tienen la direccion mala), y es a proposito:
 * los primeros mensajes de una cuenta nueva deciden si Meta la marca como
 * spam, asi que la primera tanda va a los clientes de los que mas seguro
 * estamos. Los de direccion pobre entran despues, cuando el numero ya tiene
 * historia de conversaciones contestadas.
 *
 * No se le arma una solicitud a quien ya tiene una viva ni a quien ya mando su
 * ubicacion.
 */
export async function armarTanda(
  cajeroId: string,
  cuantas: number = TAMANO_DE_TANDA,
): Promise<{ tanda: number; lineas: SolicitudParaEnviar[] }> {
  if (!Number.isInteger(cuantas) || cuantas < 1 || cuantas > 500) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'La tanda tiene que ser de 1 a 500 mensajes. Mas de 500 en un dia hace que WhatsApp bloquee el numero.',
    );
  }

  const ahora = new Date();
  const aQuienFalta = {
    estado: 'LISTO',
    esCelular: true,
    telefono: { not: null },
    // Ni los que ya contestaron, ni los que dijeron que no.
    ubicaciones: { none: {} },
    solicitudes: {
      none: {
        OR: [
          { estado: { in: ['PENDIENTE', 'RESPONDIDA', 'RECHAZADA'] } },
          { estado: { in: ['ENVIADA', 'ABIERTA'] }, expiraEn: { gt: ahora } },
        ],
      },
    },
  } satisfies Prisma.ClienteWhereInput;

  /**
   * Primero los de direccion mas pobre: son los que mas trabajo le ahorran al
   * repartidor cuando contestan.
   *
   * Va en dos consultas y no en un orderBy porque ordenar por la columna
   * ordena el TEXTO, y ahi "DETALLADA" va antes que "PASABLE" por la D. Eso
   * mandaba la primera tanda justo a los clientes cuya direccion ya servia.
   * Dos consultas explicitas dicen lo que se quiere y no dependen de como se
   * llamen los valores manana.
   */
  const porCalidad = (calidad: CalidadDireccion, cuantos: number) =>
    cuantos <= 0
      ? Promise.resolve([])
      : prisma.cliente.findMany({
          where: { ...aQuienFalta, calidadDireccion: calidad },
          orderBy: { clave: 'asc' },
          take: cuantos,
          include: { telefonos: { where: { origen: { in: ['DIRECTO', 'CLAVE_DEL_POS'] } } } },
        });

  const pasables = await porCalidad('PASABLE', cuantas);
  const detalladas = await porCalidad('DETALLADA', cuantas - pasables.length);
  const candidatos = [...pasables, ...detalladas];

  if (candidatos.length === 0) return { tanda: 0, lineas: [] };

  const ultima = await prisma.solicitudUbicacion.aggregate({ _max: { tanda: true } });
  const tanda = (ultima._max.tanda ?? 0) + 1;
  const expiraEn = new Date(ahora.getTime() + DIAS_DE_VIGENCIA * 24 * 60 * 60 * 1000);

  const armadas: SolicitudParaEnviar[] = [];
  for (const cliente of candidatos) {
    const telefono = cliente.telefono;
    if (!telefono) continue;
    const token = nuevoToken();
    const solicitud = await prisma.solicitudUbicacion.create({
      data: {
        clienteId: cliente.id,
        telefonoId: cliente.telefonos.find((t) => t.numero === telefono)?.id ?? null,
        token,
        telefonoDestino: telefono,
        estado: 'PENDIENTE',
        tanda,
        expiraEn,
      },
    });
    const enlace = enlaceDeUbicacion(token);
    const mensaje = mensajeParaCliente(cliente.nombre, enlace);
    armadas.push({
      id: solicitud.id,
      clave: cliente.clave,
      nombre: cliente.nombre,
      telefono,
      direccionActual: cliente.direccionTexto,
      enlace,
      mensaje,
      enlaceWhatsApp: enlaceWhatsApp(telefono, mensaje),
    });
  }

  await prisma.$transaction(async (tx) => {
    await registrarEvento(tx, {
      tipo: 'SOLICITUDES_GENERADAS',
      cajeroId,
      entidadTipo: 'SolicitudUbicacion',
      entidadId: `tanda ${tanda}`,
      detalle: { tanda, cuantas: armadas.length },
    });
  });

  return { tanda, lineas: armadas };
}

/**
 * Marca una tanda como enviada.
 *
 * Lo aprieta la persona que mando los mensajes, despues de mandarlos. El
 * sistema no puede saberlo por si mismo porque no es el que escribe.
 */
export async function marcarTandaEnviada(tanda: number, cajeroId: string): Promise<number> {
  const { count } = await prisma.solicitudUbicacion.updateMany({
    where: { tanda, estado: 'PENDIENTE' },
    data: { estado: 'ENVIADA', enviadaEn: new Date() },
  });
  await prisma.$transaction(async (tx) => {
    await registrarEvento(tx, {
      tipo: 'SOLICITUDES_MARCADAS_ENVIADAS',
      cajeroId,
      entidadTipo: 'SolicitudUbicacion',
      entidadId: `tanda ${tanda}`,
      detalle: { tanda, cuantas: count },
    });
  });
  return count;
}

/** Las solicitudes de una tanda, para volver a ver la lista de envio. */
export async function tandaPorNumero(tanda: number): Promise<SolicitudParaEnviar[]> {
  const solicitudes = await prisma.solicitudUbicacion.findMany({
    where: { tanda },
    include: { cliente: true },
    orderBy: { creadaEn: 'asc' },
  });
  return solicitudes.map((s) => {
    const enlace = enlaceDeUbicacion(s.token);
    const mensaje = mensajeParaCliente(s.cliente.nombre, enlace);
    return {
      id: s.id,
      clave: s.cliente.clave,
      nombre: s.cliente.nombre,
      telefono: s.telefonoDestino,
      direccionActual: s.cliente.direccionTexto,
      enlace,
      mensaje,
      enlaceWhatsApp: enlaceWhatsApp(s.telefonoDestino, mensaje),
    };
  });
}

// -----------------------------------------------------------------------------
// Lo que hace el cliente
// -----------------------------------------------------------------------------

export interface SolicitudAbierta {
  token: string;
  nombreCliente: string;
  /** Lo que la pizzeria tiene escrito hoy, para que el cliente lo corrija. */
  direccionActual: string;
  yaRespondio: boolean;
}

/**
 * Carga una solicitud por su token y anota que el cliente abrio el enlace.
 *
 * Que se abra ya es informacion valiosa aunque el cliente no mande nada: el
 * numero existe, es de una persona, y leyo el mensaje. Eso vale para los 1.219
 * numeros que estan por confirmar.
 */
export async function abrirSolicitud(token: string): Promise<SolicitudAbierta | null> {
  const solicitud = await prisma.solicitudUbicacion.findUnique({
    where: { token },
    include: { cliente: true },
  });
  if (!solicitud) return null;
  if (solicitud.expiraEn < new Date()) return null;
  if (solicitud.estado === 'RECHAZADA') return null;

  if (!solicitud.abiertaEn) {
    await prisma.solicitudUbicacion.update({
      where: { id: solicitud.id },
      data: {
        abiertaEn: new Date(),
        // Si nadie habia marcado la tanda como enviada, es obvio que se mando.
        estado: solicitud.estado === 'RESPONDIDA' ? 'RESPONDIDA' : 'ABIERTA',
      },
    });
    // Abrir el enlace prueba que el numero es de quien creiamos.
    if (solicitud.telefonoId) {
      await prisma.telefonoCliente.update({
        where: { id: solicitud.telefonoId },
        data: { verificadoEn: new Date() },
      });
    }
  }

  return {
    token: solicitud.token,
    nombreCliente: solicitud.cliente.nombre,
    direccionActual: solicitud.cliente.direccionTexto,
    yaRespondio: solicitud.estado === 'RESPONDIDA',
  };
}

export interface UbicacionDelCliente {
  token: string;
  latitud: number;
  longitud: number;
  precisionMetros: number | null;
  nota: string | null;
  /** El texto que el cliente tenia a la vista al aceptar. */
  textoAceptado: string;
  ip: string | null;
}

/**
 * Guarda el punto que mando un cliente.
 *
 * Entra como PROPUESTA: no reemplaza la direccion escrita hasta que alguien de
 * la pizzeria la acepte. Ver la decision 3 del encabezado.
 */
export async function guardarUbicacionDelCliente(datos: UbicacionDelCliente): Promise<void> {
  const solicitud = await prisma.solicitudUbicacion.findUnique({
    where: { token: datos.token },
  });
  if (!solicitud) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Este enlace no existe. Pidalo de nuevo a la pizzeria.');
  }
  if (solicitud.expiraEn < new Date()) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Este enlace ya vencio. Pidalo de nuevo a la pizzeria.');
  }

  const { latitud, longitud, precisionMetros } = datos;
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'No se recibio una ubicacion valida.');
  }
  if (
    latitud < LIMITES_CR.latMin ||
    latitud > LIMITES_CR.latMax ||
    longitud < LIMITES_CR.lonMin ||
    longitud > LIMITES_CR.lonMax
  ) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      'La ubicacion que mando su telefono no esta en Costa Rica. Revise que tenga el GPS encendido.',
    );
  }
  if (precisionMetros !== null && precisionMetros > PRECISION_MAXIMA_METROS) {
    throw new ErrorNegocio(
      'DATOS_INVALIDOS',
      `Su telefono dice que la ubicacion puede estar equivocada por ${Math.round(precisionMetros)} metros. ` +
        'Salga al patio o a la calle y vuelva a intentarlo.',
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.ubicacionCliente.create({
      data: {
        clienteId: solicitud.clienteId,
        solicitudId: solicitud.id,
        latitud,
        longitud,
        precisionMetros,
        origen: 'CLIENTE',
        nota: datos.nota?.trim().slice(0, 300) || null,
        estado: 'PROPUESTA',
        ip: datos.ip,
      },
    });
    await tx.solicitudUbicacion.update({
      where: { id: solicitud.id },
      data: {
        estado: 'RESPONDIDA',
        respondidaEn: new Date(),
        textoAceptado: datos.textoAceptado.slice(0, 1000),
        aceptadoEn: new Date(),
        ip: datos.ip,
      },
    });
    if (solicitud.telefonoId) {
      await tx.telefonoCliente.update({
        where: { id: solicitud.telefonoId },
        data: { verificadoEn: new Date() },
      });
    }
    await registrarEvento(tx, {
      tipo: 'UBICACION_RECIBIDA',
      entidadTipo: 'Cliente',
      entidadId: solicitud.clienteId,
      detalle: { origen: 'CLIENTE', tanda: solicitud.tanda, conNota: Boolean(datos.nota) },
      ip: datos.ip,
    });
  });
}

/**
 * El cliente dijo que no quiere compartirla.
 *
 * Se guarda para no volver a escribirle. Preguntar dos veces lo mismo despues
 * de un no es la forma mas rapida de que alguien bloquee el numero.
 */
export async function rechazarSolicitud(token: string, ip: string | null): Promise<void> {
  const solicitud = await prisma.solicitudUbicacion.findUnique({ where: { token } });
  if (!solicitud) return;
  await prisma.solicitudUbicacion.update({
    where: { id: solicitud.id },
    data: { estado: 'RECHAZADA', rechazadaEn: new Date(), ip },
  });
}

// -----------------------------------------------------------------------------
// Lo que hace la pizzeria con lo que llego
// -----------------------------------------------------------------------------

/** Acepta una propuesta: desde aqui es la ubicacion buena del cliente. */
export async function aceptarUbicacion(id: string, cajeroId: string): Promise<void> {
  const ubicacion = await prisma.ubicacionCliente.findUnique({ where: { id } });
  if (!ubicacion) throw new ErrorNegocio('DATOS_INVALIDOS', 'Esa ubicacion ya no existe.');

  await prisma.$transaction(async (tx) => {
    // La anterior aceptada deja de serlo: la buena es una sola, y la vieja se
    // queda en la tabla porque un cliente que se muda y vuelve es cosa comun.
    await tx.ubicacionCliente.updateMany({
      where: { clienteId: ubicacion.clienteId, estado: 'ACEPTADA', id: { not: id } },
      data: { estado: 'PROPUESTA' },
    });
    await tx.ubicacionCliente.update({
      where: { id },
      data: { estado: 'ACEPTADA', revisadaEn: new Date(), revisadaPor: cajeroId },
    });
    await registrarEvento(tx, {
      tipo: 'UBICACION_ACEPTADA',
      cajeroId,
      entidadTipo: 'Cliente',
      entidadId: ubicacion.clienteId,
      detalle: { ubicacionId: id, origen: ubicacion.origen },
    });
  });
}

export async function rechazarUbicacion(
  id: string,
  cajeroId: string,
  motivo: string,
): Promise<void> {
  const ubicacion = await prisma.ubicacionCliente.findUnique({ where: { id } });
  if (!ubicacion) throw new ErrorNegocio('DATOS_INVALIDOS', 'Esa ubicacion ya no existe.');
  await prisma.$transaction(async (tx) => {
    await tx.ubicacionCliente.update({
      where: { id },
      data: { estado: 'RECHAZADA', revisadaEn: new Date(), revisadaPor: cajeroId },
    });
    await registrarEvento(tx, {
      tipo: 'UBICACION_RECHAZADA',
      cajeroId,
      entidadTipo: 'Cliente',
      entidadId: ubicacion.clienteId,
      detalle: { ubicacionId: id, motivo: motivo.trim().slice(0, 200) },
    });
  });
}

// -----------------------------------------------------------------------------
// Como va el proyecto
// -----------------------------------------------------------------------------

export interface AvanceDelProyecto {
  clientes: number;
  listos: number;
  porEstadoDeCliente: Array<{ estado: string; cuantos: number }>;
  solicitudes: Record<EstadoSolicitud, number>;
  ubicacionesPropuestas: number;
  ubicacionesAceptadas: number;
  ultimaTanda: number;
  tandaSinEnviar: number | null;
  /** De cada cien mensajes que salieron, cuantos contestaron. */
  porcentajeRespuesta: number;
}

export async function avanceDelProyecto(): Promise<AvanceDelProyecto> {
  const [clientes, porCliente, porSolicitud, propuestas, aceptadas, maxTanda, pendiente] =
    await Promise.all([
      prisma.cliente.count(),
      prisma.cliente.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.solicitudUbicacion.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.ubicacionCliente.count({ where: { estado: 'PROPUESTA' } }),
      prisma.ubicacionCliente.count({ where: { estado: 'ACEPTADA' } }),
      prisma.solicitudUbicacion.aggregate({ _max: { tanda: true } }),
      prisma.solicitudUbicacion.findFirst({
        where: { estado: 'PENDIENTE' },
        orderBy: { tanda: 'asc' },
        select: { tanda: true },
      }),
    ]);

  const solicitudes = {
    PENDIENTE: 0,
    ENVIADA: 0,
    ABIERTA: 0,
    RESPONDIDA: 0,
    VENCIDA: 0,
    RECHAZADA: 0,
  } as Record<EstadoSolicitud, number>;
  for (const fila of porSolicitud) {
    solicitudes[fila.estado as EstadoSolicitud] = fila._count._all;
  }

  const salieron =
    solicitudes.ENVIADA + solicitudes.ABIERTA + solicitudes.RESPONDIDA + solicitudes.RECHAZADA;

  return {
    clientes,
    listos: porCliente.find((f) => f.estado === 'LISTO')?._count._all ?? 0,
    porEstadoDeCliente: porCliente
      .map((f) => ({ estado: f.estado, cuantos: f._count._all }))
      .sort((a, b) => b.cuantos - a.cuantos),
    solicitudes,
    ubicacionesPropuestas: propuestas,
    ubicacionesAceptadas: aceptadas,
    ultimaTanda: maxTanda._max.tanda ?? 0,
    tandaSinEnviar: pendiente?.tanda ?? null,
    porcentajeRespuesta: salieron === 0 ? 0 : Math.round((solicitudes.RESPONDIDA / salieron) * 100),
  };
}

/** Las propuestas que esperan que alguien las mire. */
export async function ubicacionesPorRevisar(limite = 50) {
  return prisma.ubicacionCliente.findMany({
    where: { estado: 'PROPUESTA' },
    include: { cliente: { select: { clave: true, nombre: true, direccionTexto: true } } },
    orderBy: { creadaEn: 'desc' },
    take: limite,
  });
}

/**
 * Cierra las solicitudes que ya vencieron.
 *
 * Se llama desde la pantalla, no desde un trabajo programado: el proyecto dura
 * unas semanas y no vale la pena montar un cron para esto.
 */
export async function vencerSolicitudesViejas(): Promise<number> {
  const { count } = await prisma.solicitudUbicacion.updateMany({
    where: { estado: { in: ['PENDIENTE', 'ENVIADA', 'ABIERTA'] }, expiraEn: { lt: new Date() } },
    data: { estado: 'VENCIDA' },
  });
  return count;
}
