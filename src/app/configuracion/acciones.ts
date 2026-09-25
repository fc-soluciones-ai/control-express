'use server';

/**
 * Acciones de configuracion: los usuarios de caja y sus llaves.
 *
 * Todas exigen sesion de caja y rol de administrador. El rol se comprueba en
 * el servicio, no aqui: asi tambien queda cubierto si manana lo llama un
 * script o una pantalla nueva.
 */

import { revalidatePath } from 'next/cache';

import { esErrorNegocio } from '@/server/errores';
import { exigirCajero } from '@/server/services/sesion';
import {
  asignarPinUsuario,
  cambiarMiPin,
  crearUsuario,
  editarUsuario,
} from '@/server/services/usuarios';

export type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

function comoResultado(e: unknown): { ok: false; mensaje: string } {
  if (esErrorNegocio(e)) return { ok: false, mensaje: e.message };
  console.error('[configuracion]', e);
  return { ok: false, mensaje: 'Ocurrio un error inesperado. Intente de nuevo.' };
}

export async function accionCrearUsuario(entrada: {
  nombre: string;
  rol: string;
  pin: string;
}): Promise<Resultado<{ id: string }>> {
  try {
    const cajero = await exigirCajero();
    const creado = await crearUsuario(
      { nombre: String(entrada.nombre ?? ''), rol: String(entrada.rol ?? ''), pin: String(entrada.pin ?? '') },
      cajero,
    );
    revalidatePath('/configuracion/usuarios');
    revalidatePath('/entrar');
    return { ok: true, datos: creado };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionEditarUsuario(
  id: string,
  cambios: { nombre?: string; rol?: string; estado?: string },
): Promise<Resultado<null>> {
  try {
    const cajero = await exigirCajero();
    await editarUsuario(String(id ?? ''), cambios, cajero);
    revalidatePath('/configuracion/usuarios');
    revalidatePath('/entrar');
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}

export async function accionAsignarPinUsuario(
  id: string,
  pin: string,
): Promise<Resultado<{ sesionesCerradas: number; nombre: string }>> {
  try {
    const cajero = await exigirCajero();
    const resultado = await asignarPinUsuario(String(id ?? ''), String(pin ?? ''), cajero);
    revalidatePath('/configuracion/usuarios');
    return { ok: true, datos: resultado };
  } catch (e) {
    return comoResultado(e);
  }
}

/** Cambiar el PIN propio. No hace falta ser administrador, pero si saber el actual. */
export async function accionCambiarMiPin(
  pinActual: string,
  pinNuevo: string,
): Promise<Resultado<null>> {
  try {
    const cajero = await exigirCajero();
    await cambiarMiPin(cajero, String(pinActual ?? ''), String(pinNuevo ?? ''));
    return { ok: true, datos: null };
  } catch (e) {
    return comoResultado(e);
  }
}
