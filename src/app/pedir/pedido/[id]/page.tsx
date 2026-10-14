import { notFound } from 'next/navigation';

import { Seguimiento } from '@/components/quiosco/Seguimiento';
import { datosSinpe, pedidoParaElCliente } from '@/server/services/pedidos-app';

export const dynamic = 'force-dynamic';

export default async function PaginaDeSeguimiento({ params }: { params: { id: string } }) {
  const pedido = await pedidoParaElCliente(params.id);
  if (!pedido) notFound();
  // El numero de SINPE solo se muestra a quien eligio pagar asi.
  const sinpe = pedido.metodoPago === 'SINPE' ? await datosSinpe() : null;
  return <Seguimiento id={params.id} inicial={pedido} sinpe={sinpe} />;
}
