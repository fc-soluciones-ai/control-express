/**
 * Como se traducen los errores de negocio de la app de clientes a respuestas HTTP.
 * El mensaje va tal cual: lo lee el cliente en su telefono.
 */

import { NextResponse } from 'next/server';

import { esErrorNegocio, type CodigoErrorNegocio } from '@/server/errores';

const ESTADO_POR_CODIGO: Partial<Record<CodigoErrorNegocio, number>> = {
  APP_CERRADA: 503,
  DEMASIADOS_PEDIDOS: 429,
  FUERA_DE_ZONA: 422,
  PAGO_NO_DISPONIBLE: 422,
  PEDIDO_NO_ENCONTRADO: 404,
  DATOS_INVALIDOS: 400,
};

/** Lo mas que se acepta de un cuerpo: un pedido grande pesa unos pocos kilobytes. */
export const MAX_CUERPO = 100_000;

export function respuestaDeError(error: unknown, donde: string): NextResponse {
  if (esErrorNegocio(error)) {
    return NextResponse.json(
      { error: error.message, codigo: error.codigo },
      { status: ESTADO_POR_CODIGO[error.codigo] ?? 400 },
    );
  }
  console.error(`[pedir] ${donde}`, error);
  return NextResponse.json({ error: 'Algo salió mal de nuestro lado. Probá de nuevo.' }, { status: 500 });
}

/** Lee el cuerpo JSON con tope de tamano. Devuelve null si no se puede. */
export async function leerJson(peticion: Request): Promise<unknown | null> {
  const largo = Number(peticion.headers.get('content-length') ?? '0');
  if (largo > MAX_CUERPO) return null;
  const texto = await peticion.text();
  if (texto.length > MAX_CUERPO) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}
