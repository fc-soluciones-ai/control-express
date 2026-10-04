'use server';

/**
 * Lo que puede hacer un cliente desde el enlace, y nada mas.
 *
 * ESTAS DOS ACCIONES NO PIDEN SESION
 *
 * Son las unicas del sistema asi. Lo que las protege es que el token tiene
 * que existir, no haber vencido, y que todo lo que pueden hacer es agregar
 * una propuesta de ubicacion para el cliente de ese token. No reciben el id
 * del cliente: lo sacan del token. Quien tenga un enlace no puede tocar la
 * ficha de otro.
 *
 * EL PERMISO NO VIENE DEL NAVEGADOR
 *
 * El texto del consentimiento se guarda desde la constante del servidor, no
 * de lo que mande la pantalla. Si viniera de afuera, el registro probaria
 * lo que el navegador quiso decir y no lo que el cliente leyo.
 */

import { TEXTO_CONSENTIMIENTO } from '@/lib/clientes/consentimiento';
import { esErrorNegocio } from '@/server/errores';
import { ipDeLaPeticion } from '@/server/peticion';
import { guardarUbicacionDelCliente, rechazarSolicitud } from '@/server/services/ubicaciones';

export async function guardarUbicacion(datos: {
  token: string;
  latitud: number;
  longitud: number;
  precisionMetros: number | null;
  nota: string;
}): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  try {
    await guardarUbicacionDelCliente({
      token: datos.token,
      latitud: datos.latitud,
      longitud: datos.longitud,
      precisionMetros: datos.precisionMetros,
      nota: datos.nota,
      textoAceptado: TEXTO_CONSENTIMIENTO,
      ip: await ipDeLaPeticion(),
    });
    return { ok: true };
  } catch (error) {
    // El cliente no es un operador: si algo falla de verdad, no tiene a quien
    // preguntarle. Se le dice lo que puede hacer, no lo que paso.
    if (esErrorNegocio(error)) return { ok: false, mensaje: error.message };
    console.error('No se pudo guardar la ubicacion de un cliente', error);
    return {
      ok: false,
      mensaje: 'No se pudo guardar. Intente otra vez en un momento, o avisenos por WhatsApp.',
    };
  }
}

export async function noQuiereCompartir(token: string): Promise<void> {
  await rechazarSolicitud(token, await ipDeLaPeticion());
}
