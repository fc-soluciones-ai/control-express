/**
 * Si llegamos hasta una ubicacion y cuanto cuesta el envio, sin armar un pedido.
 * Es lo que muestra la cabecera de la app apenas el cliente marca donde esta.
 */

import { NextResponse } from 'next/server';

import { estaEnCostaRica } from '@/lib/pedido/envio';
import { leerJson, respuestaDeError } from '@/lib/pedido/http';
import { cotizarZona } from '@/server/services/pedidos-app';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(peticion: Request): Promise<Response> {
  const cuerpo = (await leerJson(peticion)) as { lat?: unknown; lng?: unknown } | null;
  const lat = cuerpo?.lat;
  const lng = cuerpo?.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !estaEnCostaRica({ lat, lng })) {
    return NextResponse.json({ error: 'La ubicación no es válida o no está en Costa Rica.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await cotizarZona({ lat, lng }));
  } catch (error) {
    return respuestaDeError(error, 'zona');
  }
}
