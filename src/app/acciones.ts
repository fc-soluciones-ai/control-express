'use server';

/**
 * Acciones de servidor del dashboard.
 *
 * Toda escritura pasa por aqui y saca el usuario de la cookie de sesion, nunca
 * del cliente: si el navegador pudiera decir quien firma algo, la firma no
 * valdria nada.
 *
 * Las acciones devuelven un resultado en vez de lanzar. En una pantalla tactil
 * el operador necesita leer que paso y volver a intentarlo, no una pantalla de
 * error de Next.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { esErrorNegocio } from '@/server/errores';
import {
  cerrarSesion,
  iniciarSesion,
  iniciarSesionRepartidor,
} from '@/server/services/sesion';
import { exigirCajero } from '@/server/services/sesion';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  if (e instanceof Error && e.name === 'ZodError') {
    return { ok: false, mensaje: 'Los datos enviados no son validos.' };
  }
  console.error('[accion]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado. Intente de nuevo.' };
}

// ---------------------------------------------------------------------------
// Sesion
// ---------------------------------------------------------------------------

export async function accionEntrar(
  cajeroId: string,
  pin: string,
): Promise<Resultado<{ nombre: string }>> {
  try {
    const cajero = await iniciarSesion(cajeroId, pin, 'CAJA-WEB');
    return { ok: true, datos: { nombre: cajero.nombre } };
  } catch (e) {
    return comoResultado(e);
  }
}

/**
 * Entrada del repartidor a su propia pantalla.
 *
 * Aparte de accionEntrar porque abre una sesion de otra clase: la de caja
 * abre el tablero y el dinero, esta abre una pantalla de solo lectura.
 */
export async function accionEntrarRepartidor(
  choferId: string,
  pin: string,
): Promise<Resultado<{ nombre: string }>> {
  try {
    const repartidor = await iniciarSesionRepartidor(choferId, pin, 'REPARTIDOR-WEB');
    return { ok: true, datos: { nombre: repartidor.nombre } };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionSalir(): Promise<void> {
  await cerrarSesion();
  redirect('/entrar');
}

// ---------------------------------------------------------------------------
// Entrada y salida de turno
