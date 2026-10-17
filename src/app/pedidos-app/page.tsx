/**
 * Los pedidos que entran por la app de los clientes, para el local.
 *
 * Aqui se ve cada pedido con la ubicacion del cliente (un toque abre Waze o el
 * mapa), se confirma el SINPE, se mueve el estado y, sobre todo, esta el
 * interruptor de emergencia que abre o cierra la recepcion de pedidos.
 */

import { redirect } from 'next/navigation';

import { Cabecera } from '@/components/Cabecera';
import { PanelPedidosApp } from '@/components/PanelPedidosApp';
import { tienePermiso } from '@/server/permisos';
import {
  configDeEnvio,
  configDeLocal,
  datosSinpe,
  pedidosAbiertos,
  pedidosParaElLocal,
} from '@/server/services/pedidos-app';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function PedidosDeLaApp() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  if (!tienePermiso(cajero.rol, 'OPERACION')) redirect('/clientes');

  const [abierto, sinpe, envio, local, pedidos] = await Promise.all([
    pedidosAbiertos(),
    datosSinpe(),
    configDeEnvio(),
    configDeLocal(),
    pedidosParaElLocal(),
  ]);

  return (
    <main className="mx-auto max-w-[1200px] p-5">
      <Cabecera migas={[{ etiqueta: 'Entregas', href: '/entregas' }, { etiqueta: 'Pedidos de la app' }]} usuario={cajero} />
      <div className="mb-5">
        <h1 className="text-3xl font-bold">Pedidos de la app</h1>
        <p className="text-slate-400">
          Lo que piden los clientes desde el teléfono. Cada uno trae su ubicación para que el repartidor llegue directo.
        </p>
      </div>
      <PanelPedidosApp inicial={{ abierto, sinpe, envio, local, pedidos }} />
    </main>
  );
}
