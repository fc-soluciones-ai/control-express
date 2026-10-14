/**
 * Por donde el cliente confirma su pedido. Es PUBLICA: no hay sesion. Lo que la
 * protege es que el servidor recalcula todo (ver services/pedidos-app.ts), que
 * hay un interruptor de emergencia y que hay un tope de pedidos por telefono.
 */

import { NextResponse } from 'next/server';

import { leerJson, respuestaDeError } from '@/lib/pedido/http';
import { crearPedidoApp } from '@/server/services/pedidos-app';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(peticion: Request): Promise<Response> {
  const cuerpo = await leerJson(peticion);
  if (cuerpo === null) {
    return NextResponse.json({ error: 'El pedido no llegó completo.' }, { status: 400 });
  }
  try {
    const creado = await crearPedidoApp(cuerpo);
    return NextResponse.json(creado, { status: creado.repetido ? 200 : 201 });
  } catch (error) {
    return respuestaDeError(error, 'crear');
  }
}
