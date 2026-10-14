/**
 * El estado de un pedido, para que la pantalla de seguimiento del cliente se
 * actualice sola. Se busca por el id largo que no se puede adivinar.
 */

import { NextResponse } from 'next/server';

import { pedidoParaElCliente } from '@/server/services/pedidos-app';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _peticion: Request,
  contexto: { params: { id: string } },
): Promise<Response> {
  const pedido = await pedidoParaElCliente(contexto.params.id);
  if (!pedido) return NextResponse.json({ error: 'No se encontró el pedido.' }, { status: 404 });
  return NextResponse.json(pedido);
}
