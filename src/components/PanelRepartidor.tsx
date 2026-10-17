'use client';

/**
 * Lo que ve el repartidor en su telefono.
 *
 * Una sola columna y numeros grandes: esto se mira de pie, en la calle, con
 * una mano. Es una pantalla para consultar, no para registrar.
 *
 * Lo primero son los pedidos de la app que el local le dio: cada uno trae la
 * ubicacion que marco el cliente, con un toque para abrir Waze, y cuanto hay que
 * cobrar en la puerta. Despues, los pedidos del sistema de la pizzeria que lleva
 * en la calle, con el color de cuanto lleva esperando el cliente.
 */

import { accionSalir } from '@/app/acciones';
import { minutosDesde, colorDeEspera, ETIQUETA_TRAMO } from '@/lib/entregas/espera';
import { formatearMoneda } from '@/lib/money/money';
import { enlaceDeMapa, enlaceDeWaze } from '@/lib/pedido/envio';
import type { ResumenDelRepartidor } from '@/server/services/repartidor';
import type { RepartidorEnSesion } from '@/server/services/sesion';

interface Props {
  repartidor: RepartidorEnSesion;
  resumen: ResumenDelRepartidor;
  /** Instante en que el servidor armo la pantalla, para medir la espera. */
  ahora: string;
}

const NOMBRE_ESTADO_APP: Record<string, string> = {
  ACEPTADO: 'Aceptado',
  EN_COCINA: 'En cocina',
  EN_CAMINO: 'Despachado',
};

export function PanelRepartidor({ repartidor, resumen, ahora }: Props) {
  const referencia = new Date(ahora);
  const hora = (f: Date | string) =>
    new Date(f).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });
  const sinNada = resumen.pedidosApp.length === 0 && resumen.enCamino.length === 0;

  return (
    <main className="mx-auto max-w-lg p-5">
      <header className="flex items-start justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-14 w-auto shrink-0" width={78} height={56} />
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-slate-500">Repartidor</p>
          <h1 className="text-2xl font-bold">{repartidor.nombre}</h1>
          <p className="text-sm text-slate-400">
            {resumen.moto ? `Moto ${resumen.moto.placa}` : 'Hoy no tiene moto asignada'}
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-borde px-4 py-2 text-sm text-slate-400 active:scale-95"
          onClick={() => void accionSalir()}
        >
          Salir
        </button>
      </header>

      <section className="tarjeta mt-5 p-6 text-center">
        <p className="text-xs uppercase tracking-widest text-slate-500">Pedidos por entregar</p>
        <p className="cifra mt-2 text-6xl font-bold text-slate-100">
          {resumen.pedidosApp.length + resumen.enCamino.length}
        </p>
      </section>

      {resumen.pedidosApp.length > 0 ? (
        <section className="mt-4 space-y-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pedidos de la app</p>
          {resumen.pedidosApp.map((p) => (
            <article key={p.id} className="tarjeta p-5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="cifra text-xl font-bold">#{p.numero}</span>
                <span className="text-sm text-slate-400">{NOMBRE_ESTADO_APP[p.estado] ?? p.estado}</span>
              </div>
              <p className="mt-1 text-lg font-semibold">{p.nombre}</p>
              <p className="text-sm text-slate-300">{p.direccion}</p>
              {p.referencia ? <p className="text-sm text-slate-400">Referencia: {p.referencia}</p> : null}
              <p className="mt-2 text-sm">
                {p.porCobrar > 0 ? (
                  <>
                    Cobrar <strong className="cifra text-lg">{formatearMoneda(p.porCobrar)}</strong>
                    {p.pagaCon ? (
                      <span className="text-slate-400">
                        {' '}
                        · paga con {formatearMoneda(p.pagaCon)}, vuelto {formatearMoneda(p.pagaCon - p.porCobrar)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-entrada">Ya está pagado</span>
                )}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {p.ubicacion ? (
                  <>
                    <a
                      href={enlaceDeWaze(p.ubicacion)}
                      className="boton-tactil flex items-center justify-center bg-sky-500 text-lg font-bold text-black"
                    >
                      🧭 Waze
                    </a>
                    <a
                      href={enlaceDeMapa(p.ubicacion)}
                      className="boton-tactil flex items-center justify-center bg-panelClaro text-lg font-bold"
                    >
                      📍 Mapa
                    </a>
                  </>
                ) : (
                  <span className="col-span-2 self-center text-sm text-alerta">Sin ubicación</span>
                )}
                <a
                  href={`tel:${p.telefono}`}
                  className="boton-tactil flex items-center justify-center bg-entrada text-lg font-bold text-slate-950"
                >
                  📞 Llamar
                </a>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {resumen.enCamino.length > 0 ? (
        <section className="tarjeta mt-4 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">En la calle (sistema de la pizzería)</p>
          <ul className="mt-3 space-y-2">
            {resumen.enCamino.map((pedido) => {
              const minutos = minutosDesde(pedido.salioEn, referencia);
              const color = colorDeEspera(minutos);
              return (
                <li
                  key={pedido.id}
                  className={`rounded-2xl border p-3 ${color.borde} ${color.fondo} ${
                    color.parpadea ? 'animate-parpadeo' : ''
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="cifra font-bold text-slate-100">#{pedido.folio}</span>
                    <span className={`cifra text-xl font-bold ${color.texto}`}>
                      {minutos === null ? 'sin hora' : `${minutos} min`}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-100">
                    {pedido.cliente ?? 'cliente no ligado todavia'}
                  </p>
                  {pedido.direccion ? (
                    <p className={`mt-1 text-xs ${color.secundario}`}>{pedido.direccion}</p>
                  ) : null}
                  {pedido.salioEn ? (
                    <p className={`mt-1 text-xs ${color.secundario}`}>Salio a las {hora(pedido.salioEn)}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            El color es el tiempo que el cliente lleva esperando: {ETIQUETA_TRAMO.VERDE},{' '}
            {ETIQUETA_TRAMO.NARANJA}, {ETIQUETA_TRAMO.ROJO}, {ETIQUETA_TRAMO.CRITICO}.
          </p>
        </section>
      ) : null}

      {sinNada ? (
        <section className="tarjeta mt-4 p-5 text-center text-slate-400">
          No tiene pedidos pendientes ahora mismo.
        </section>
      ) : null}

      <p className="mt-6 text-center text-xs text-slate-600">
        {resumen.entregadosHoy} entregado{resumen.entregadosHoy === 1 ? '' : 's'} de {resumen.pedidosHoy} del
        sistema de la pizzería hoy · día operativo {resumen.diaOperativo}.
      </p>
    </main>
  );
}
