/**
 * Lo que va a costar un pedido, antes de confirmarlo: subtotal, envio y total,
 * calculados por el servidor con la ubicacion del cliente. No guarda nada.
 */

import { NextResponse } from 'next/server';

import { leerJson, respuestaDeError } from '@/lib/pedido/http';
import { cotizarDesdeCrudo } from '@/server/services/pedidos-app';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(peticion: Request): Promise<Response> {
  const cuerpo = await leerJson(peticion);
  if (cuerpo === null) {
    return NextResponse.json({ error: 'El pedido no llegó completo.' }, { status: 400 });
  }
  try {
    const c = await cotizarDesdeCrudo(cuerpo);
    return NextResponse.json({
      subtotal: c.subtotal,
      envio: c.envio,
      cargoApp: c.cargoApp,
      total: c.total,
      distanciaKm: c.distanciaKm,
    });
  } catch (error) {
    return respuestaDeError(error, 'cotizar');
  }
}
