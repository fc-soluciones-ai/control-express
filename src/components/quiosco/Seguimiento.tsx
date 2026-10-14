'use client';

/**
 * La pantalla que ve el cliente despues de confirmar: el estado de su pedido, que
 * se actualiza sola, y lo que tiene que saber (el SINPE, si eligio pagar asi).
 */

import { useEffect, useState } from 'react';

import { enlaceDeMapa } from '@/lib/pedido/envio';
import type { DatosSinpe, EstadoDePedidoApp, PedidoParaElCliente } from '@/server/services/pedidos-app';

import { colones, Tarjeta } from './ui';

const PASOS: Array<{ estado: EstadoDePedidoApp; titulo: string; detalle: string; icono: string }> = [
  { estado: 'NUEVO', titulo: 'Recibimos tu pedido', detalle: 'Lo estamos revisando', icono: '📩' },
  { estado: 'ACEPTADO', titulo: 'Pedido confirmado', detalle: 'Ya entró a la cocina', icono: '✅' },
  { estado: 'EN_COCINA', titulo: 'En la cocina', detalle: 'Lo están preparando', icono: '👨‍🍳' },
  { estado: 'EN_CAMINO', titulo: 'Va en camino', detalle: 'El repartidor ya salió', icono: '🛵' },
  { estado: 'ENTREGADO', titulo: 'Entregado', detalle: '¡Buen provecho!', icono: '🍕' },
];

const CADA_MS = 8000;

export function Seguimiento({
  id,
  inicial,
  sinpe,
}: {
  id: string;
  inicial: PedidoParaElCliente;
  sinpe: DatosSinpe | null;
}) {
  const [pedido, setPedido] = useState(inicial);

  // Se actualiza sola, hasta que el pedido se cierra.
  useEffect(() => {
    if (pedido.estado === 'ENTREGADO' || pedido.estado === 'CANCELADO') return;
    const t = setInterval(() => {
      fetch(`/api/pedir/seguimiento/${id}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => {
          if (p) setPedido(p as PedidoParaElCliente);
        })
        .catch(() => undefined);
    }, CADA_MS);
    return () => clearInterval(t);
  }, [id, pedido.estado]);

  const cancelado = pedido.estado === 'CANCELADO';
  const indice = PASOS.findIndex((p) => p.estado === pedido.estado);

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-5">
      <header className="flex items-center gap-3">
        <img src="/logo.png" alt="" className="h-12 w-auto" />
        <div className="leading-tight">
          <p className="text-sm font-bold text-tinta/60">Pedido</p>
          <h1 className="text-3xl font-extrabold text-tomate">#{pedido.numero}</h1>
        </div>
      </header>

      {cancelado ? (
        <p className="mt-5 rounded-3xl bg-red-100 p-5 text-lg font-bold text-red-900">
          Este pedido se canceló. Si fue un error, llamanos al{' '}
          <a href="tel:24877021" className="underline">
            2487-7021
          </a>
          .
        </p>
      ) : (
        <ol className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          {PASOS.map((paso, i) => {
            const hecho = i < indice;
            const actual = i === indice;
            return (
              <li key={paso.estado} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${
                      actual ? 'bg-tomate text-white shadow-md' : hecho ? 'bg-albahaca text-white' : 'bg-crema text-tinta/40'
                    }`}
                  >
                    {hecho ? '✓' : paso.icono}
                  </span>
                  {i < PASOS.length - 1 && <span className={`h-8 w-1 ${hecho ? 'bg-albahaca' : 'bg-black/10'}`} />}
                </div>
                <div className={`pb-4 pt-1 ${hecho || actual ? '' : 'opacity-45'}`}>
                  <p className={`text-lg font-extrabold ${actual ? 'text-tomate' : ''}`}>{paso.titulo}</p>
                  {actual && <p className="text-sm text-tinta/70">{paso.detalle}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {sinpe && pedido.estado !== 'CANCELADO' && (
        <div className="mt-4 rounded-3xl bg-albahaca/10 p-5 ring-2 ring-albahaca">
          <p className="text-lg font-extrabold text-albahaca">Pagá por SINPE Móvil</p>
          <p className="mt-2 text-base">
            Enviá <strong>{colones(pedido.total)}</strong> al número <strong className="text-xl">{sinpe.numero}</strong>{' '}
            a nombre de {sinpe.nombre}.
          </p>
          <p className="mt-1 text-sm text-tinta/70">
            En el detalle del SINPE escribí <strong>#{pedido.numero}</strong> para que lo encontremos.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-4">
        <Tarjeta titulo="Tu pedido">
          <ul className="space-y-3">
            {pedido.lineas.map((l, i) => (
              <li key={i}>
                <p className="font-extrabold">
                  {l.cantidad} × {l.nombre}
                </p>
                {l.detalle && <p className="text-sm text-tinta/70">{l.detalle}</p>}
                {l.extras.map((e) => (
                  <p key={e} className="text-sm text-tinta/70">
                    + {e}
                  </p>
                ))}
                {l.notas.map((n) => (
                  <p key={n} className="text-sm italic text-tinta/70">
                    “{n}”
                  </p>
                ))}
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-black/10 pt-3">
            <div className="flex justify-between">
              <dt className="text-tinta/70">Subtotal</dt>
              <dd className="font-bold">{colones(pedido.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tinta/70">Envío</dt>
              <dd className="font-bold">{colones(pedido.envio)}</dd>
            </div>
            <div className="flex justify-between text-xl font-extrabold">
              <dt>Total</dt>
              <dd>{colones(pedido.total)}</dd>
            </div>
          </dl>
        </Tarjeta>

        <Tarjeta titulo="Entrega">
          <p className="font-bold">{pedido.nombre}</p>
          <p className="text-tinta/80">{pedido.direccion}</p>
          {pedido.ubicacion && (
            <a
              href={enlaceDeMapa(pedido.ubicacion)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-bold text-tomate underline"
            >
              📍 Ver mi ubicación en el mapa
            </a>
          )}
          <p className="mt-3 text-sm text-tinta/70">
            Pago:{' '}
            {pedido.metodoPago === 'EFECTIVO'
              ? `efectivo${pedido.pagaCon ? `, pagás con ${colones(pedido.pagaCon)}` : ', pago exacto'}`
              : pedido.metodoPago === 'SINPE'
                ? 'SINPE Móvil'
                : 'tarjeta'}
          </p>
        </Tarjeta>

        <a
          href="tel:24877021"
          className="flex min-h-[3.75rem] items-center justify-center rounded-2xl bg-white text-lg font-extrabold text-tomate shadow-sm ring-1 ring-black/5"
        >
          📞 Llamar al local · 2487-7021
        </a>
        <a href="/pedir" className="block text-center text-base font-bold text-tinta/70 underline">
          Volver al menú
        </a>
      </div>
    </main>
  );
}
