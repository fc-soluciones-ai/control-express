/**
 * Lo que llega desde WhatsApp.
 *
 * El cliente recibe un mensaje de la pizzeria, toca el clip, elige Ubicacion y
 * la manda. Meta nos avisa de ese mensaje en un webhook y aqui se convierte en
 * un punto en el mapa ligado a su ficha.
 *
 * POR QUE ASI Y NO CON UN ENLACE
 *
 * El enlace y la pantalla propia existen (ver ubicaciones.ts) y siguen
 * sirviendo, pero piden tres toques mas y meten un navegador de por medio.
 * Mandar la ubicacion desde WhatsApp son dos toques y el cliente no sale de
 * donde ya estaba. En una campana a miles de personas, esa diferencia es la
 * mitad de las respuestas.
 *
 * LO QUE LLEGA ES UN TELEFONO, NO UN CLIENTE
 *
 * De ahi que todo entre primero a MensajeUbicacion, que es una bandeja, y solo
 * lo que se pudo ligar sin dudas pasa a la ficha. Tres casos obligan a que
 * decida una persona:
 *
 *   - el numero no esta en la base (pidio desde el celular de la hija);
 *   - el numero esta en dos fichas, que le pasa a 337 numeros de esta base;
 *   - el punto cayo fuera de Costa Rica o lejisimos de la zona de reparto.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { esTelefonoCR } from '@/lib/clientes/normalizar';
import { registrarEvento } from '@/server/services/auditoria';

/**
 * Costa Rica, con holgura.
 *
 * Un cliente conectado por VPN, o un telefono que entrego la posicion de la
 * antena, puede mandar un punto en otro pais. Se guarda igual, marcado, para
 * que se vea que contesto; lo que no se hace es ponerlo en su ficha.
 */
const LIMITES_CR = { latMin: 8, latMax: 11.3, lonMin: -86, lonMax: -82.5 };

// -----------------------------------------------------------------------------
// Firma
// -----------------------------------------------------------------------------

/**
 * Comprueba que el aviso lo mando Meta y no cualquiera.
 *
 * La direccion del webhook es publica: esta en internet y quien la descubra
 * puede mandarle lo que quiera. Sin esta comprobacion, cualquiera podria
 * inventar la ubicacion de un cliente, o llenar la bandeja de basura.
 *
 * Meta firma el cuerpo CRUDO con HMAC-SHA256 y el secreto de la aplicacion. Hay
 * que firmar los bytes tal como llegaron: volver a serializar el JSON cambia
 * espacios y orden, y la firma deja de calzar.
 *
 * La comparacion es en tiempo constante. Con un == normal, el tiempo que tarda
 * en fallar dice cuantos caracteres acerto, y con suficientes intentos se
 * reconstruye la firma byte por byte.
 */
export function firmaValida(cuerpoCrudo: string, cabecera: string | null): boolean {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) return false;
  if (!cabecera || !cabecera.startsWith('sha256=')) return false;

  const recibida = Buffer.from(cabecera.slice('sha256='.length), 'hex');
  const calculada = createHmac('sha256', secreto).update(cuerpoCrudo, 'utf8').digest();

  // timingSafeEqual exige el mismo largo; si no lo es, ya es invalida.
  if (recibida.length !== calculada.length) return false;
  return timingSafeEqual(recibida, calculada);
}

/** La respuesta al "ping" con el que Meta da de alta el webhook. */
export function respuestaDeVerificacion(parametros: URLSearchParams): string | null {
  const modo = parametros.get('hub.mode');
  const token = parametros.get('hub.verify_token');
  const reto = parametros.get('hub.challenge');
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (modo !== 'subscribe' || !esperado || token !== esperado) return null;
  return reto;
}

// -----------------------------------------------------------------------------
// Lo que manda Meta
// -----------------------------------------------------------------------------

export interface UbicacionDeWhatsApp {
  mensajeId: string;
  telefonoCrudo: string;
  latitud: number;
  longitud: number;
  nombre: string | null;
  direccion: string | null;
}

/**
 * Saca las ubicaciones de lo que manda Meta.
 *
 * El aviso viene anidado en entry[].changes[].value.messages[] y puede traer
 * varios mensajes de varias personas en una sola llamada. Lo que no sea una
 * ubicacion se ignora en silencio: tambien llegan avisos de entrega, de
 * lectura, y mensajes de texto de gente contestando "gracias".
 */
export function ubicacionesDelAviso(cuerpo: unknown): UbicacionDeWhatsApp[] {
  const encontradas: UbicacionDeWhatsApp[] = [];
  const raiz = cuerpo as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            location?: {
              latitude?: number;
              longitude?: number;
              name?: string;
              address?: string;
            };
          }>;
        };
      }>;
    }>;
  };

  for (const entrada of raiz?.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      for (const mensaje of cambio.value?.messages ?? []) {
        if (mensaje.type !== 'location' || !mensaje.location) continue;
        const { latitude, longitude } = mensaje.location;
        if (typeof latitude !== 'number' || typeof longitude !== 'number') continue;
        if (!mensaje.id || !mensaje.from) continue;
        encontradas.push({
          mensajeId: mensaje.id,
          telefonoCrudo: mensaje.from,
          latitud: latitude,
          longitud: longitude,
          nombre: mensaje.location.name ?? null,
          direccion: mensaje.location.address ?? null,
        });
      }
    }
  }
  return encontradas;
}

/**
 * De 50687069355 a 87069355.
 *
 * WhatsApp manda el numero con codigo de pais y sin el mas. Devuelve null si
 * no queda un telefono de Costa Rica: un cliente que escribe desde el
 * extranjero no se puede cruzar con la base.
 */
export function telefonoDeWhatsApp(crudo: string): string | null {
  const digitos = crudo.replace(/\D/g, '');
  const sinPais = digitos.startsWith('506') ? digitos.slice(3) : digitos;
  return esTelefonoCR(sinPais) ? sinPais : null;
}

// -----------------------------------------------------------------------------
// Guardar
// -----------------------------------------------------------------------------

export type ResultadoDeMensaje =
  | 'LIGADA'
  | 'SIN_CLIENTE'
  | 'AMBIGUA'
  | 'FUERA_DE_ZONA'
  | 'REPETIDA';

/**
 * Guarda una ubicacion recibida y, si se puede, la liga a su cliente.
 *
 * Devuelve que paso con ella. Nunca lanza por un mensaje malo: si uno falla,
 * Meta reintenta el lote entero y los buenos se procesarian dos veces.
 */
export async function recibirUbicacion(
  entrada: UbicacionDeWhatsApp,
): Promise<ResultadoDeMensaje> {
  // Meta reintenta cuando no contestamos rapido. El mismo mensaje no puede
  // dejar dos puntos en la ficha del mismo cliente.
  const yaEstaba = await prisma.mensajeUbicacion.findUnique({
    where: { mensajeId: entrada.mensajeId },
  });
  if (yaEstaba) return 'REPETIDA';

  const telefono = telefonoDeWhatsApp(entrada.telefonoCrudo);
  const candidatos = telefono
    ? await prisma.cliente.findMany({
        where: { OR: [{ telefono }, { telefonos: { some: { numero: telefono } } }] },
        select: { id: true },
      })
    : [];

  const fuera =
    entrada.latitud < LIMITES_CR.latMin ||
    entrada.latitud > LIMITES_CR.latMax ||
    entrada.longitud < LIMITES_CR.lonMin ||
    entrada.longitud > LIMITES_CR.lonMax;

  let estado: ResultadoDeMensaje;
  if (fuera) estado = 'FUERA_DE_ZONA';
  else if (candidatos.length === 1) estado = 'LIGADA';
  else if (candidatos.length > 1) estado = 'AMBIGUA';
  else estado = 'SIN_CLIENTE';

  const clienteId = estado === 'LIGADA' ? (candidatos[0]?.id ?? null) : null;

  await prisma.$transaction(async (tx) => {
    await tx.mensajeUbicacion.create({
      data: {
        mensajeId: entrada.mensajeId,
        telefonoCrudo: entrada.telefonoCrudo,
        telefono,
        latitud: entrada.latitud,
        longitud: entrada.longitud,
        nombre: entrada.nombre,
        direccion: entrada.direccion,
        estado,
        clienteId,
        candidatos: candidatos.length,
      },
    });

    if (clienteId) {
      // Entra como propuesta, igual que las de la pantalla: el cliente pudo
      // mandar la ubicacion del trabajo o la del super donde estaba.
      await tx.ubicacionCliente.create({
        data: {
          clienteId,
          latitud: entrada.latitud,
          longitud: entrada.longitud,
          origen: 'CLIENTE',
          nota: entrada.nombre ?? entrada.direccion,
          estado: 'PROPUESTA',
        },
      });
      // Que haya contestado prueba que el numero es de quien creiamos.
      if (telefono) {
        await tx.telefonoCliente.updateMany({
          where: { clienteId, numero: telefono },
          data: { verificadoEn: new Date() },
        });
      }
    }

    await registrarEvento(tx, {
      tipo: 'UBICACION_RECIBIDA',
      entidadTipo: 'Cliente',
      entidadId: clienteId ?? entrada.telefonoCrudo,
      detalle: { origen: 'WHATSAPP', estado, candidatos: candidatos.length },
    });
  });

  return estado;
}

/** La bandeja de lo que llego y nadie ha resuelto. */
export async function mensajesPorResolver(limite = 50) {
  return prisma.mensajeUbicacion.findMany({
    where: { estado: { in: ['SIN_CLIENTE', 'AMBIGUA', 'FUERA_DE_ZONA'] }, resueltoEn: null },
    orderBy: { recibidoEn: 'desc' },
    take: limite,
  });
}

/** Cuantos mensajes hay en cada estado, para la pantalla de la campana. */
export async function resumenDeMensajes(): Promise<Record<string, number>> {
  const filas = await prisma.mensajeUbicacion.groupBy({
    by: ['estado'],
    _count: { _all: true },
  });
  const resumen: Record<string, number> = {};
  for (const fila of filas) resumen[fila.estado] = fila._count._all;
  return resumen;
}
