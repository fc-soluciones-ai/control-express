'use client';

/**
 * El panel del local para los pedidos de la app de clientes.
 *
 * Tres cosas que importan:
 *  - el INTERRUPTOR de arriba, que abre o cierra la recepcion de pedidos al instante;
 *  - la UBICACION de cada pedido, con un toque a Waze o al mapa, para que el
 *    repartidor llegue a la puerta sin llamar a preguntar;
 *  - el estado, que el cliente ve en su telefono.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';

import {
  accionAbrirOCerrar,
  accionAsignarRepartidor,
  accionCambiarEstado,
  accionGuardarEnvio,
  accionGuardarLocal,
  accionGuardarLocalDesdeGps,
  accionGuardarSinpe,
  accionLeerPedidosApp,
  accionVerificarPago,
  type EstadoDeLaPantalla,
} from '@/app/pedidos-app/acciones';
import { CARGO_PLATAFORMA, NOMBRE_CARGO_PLATAFORMA } from '@/lib/pedido/cargos';
import { enlaceDeMapa, enlaceDeWaze } from '@/lib/pedido/envio';
import { formatearMoneda } from '@/lib/money/money';
import type { EstadoDePedidoApp, PedidoParaElLocal, RepartidorDeLaApp } from '@/server/services/pedidos-app';

const CADA_CUANTO_SE_LEE = 10_000;

const SIGUIENTE: Partial<Record<EstadoDePedidoApp, { estado: EstadoDePedidoApp; texto: string }>> = {
  NUEVO: { estado: 'ACEPTADO', texto: 'Aceptar' },
  ACEPTADO: { estado: 'EN_COCINA', texto: 'Pasar a cocina' },
  EN_COCINA: { estado: 'EN_CAMINO', texto: 'Despachado' },
  EN_CAMINO: { estado: 'ENTREGADO', texto: 'Entregado' },
};

const COLOR_DE_ESTADO: Record<EstadoDePedidoApp, string> = {
  NUEVO: 'bg-aviso text-black',
  ACEPTADO: 'bg-sky-500 text-black',
  EN_COCINA: 'bg-sky-500 text-black',
  EN_CAMINO: 'bg-entrada text-black',
  ENTREGADO: 'bg-slate-600 text-white',
  CANCELADO: 'bg-alerta text-white',
};

const NOMBRE_DE_ESTADO: Record<EstadoDePedidoApp, string> = {
  NUEVO: 'Nuevo',
  ACEPTADO: 'Aceptado',
  EN_COCINA: 'En cocina',
  EN_CAMINO: 'Despachado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

const hora = (iso: string): string =>
  new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

export function PanelPedidosApp({ inicial }: { inicial: EstadoDeLaPantalla }) {
  const [datos, setDatos] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  const [sinpeNumero, setSinpeNumero] = useState(inicial.sinpe?.numero ?? '');
  const [sinpeNombre, setSinpeNombre] = useState(inicial.sinpe?.nombre ?? '');
  const [modoEnvio, setModoEnvio] = useState<'FIJO' | 'DISTANCIA'>(inicial.envio.modo);
  const [envioFijo, setEnvioFijo] = useState(String(inicial.envio.fijo / 100));
  const [textoLocal, setTextoLocal] = useState('');
  const [radio, setRadio] = useState(String(inicial.local.radioKm));
  const [buscandoGps, setBuscandoGps] = useState(false);

  const leer = useCallback(async () => {
    try {
      setDatos(await accionLeerPedidosApp());
    } catch {
      /* se reintenta en la siguiente lectura */
    }
  }, []);

  useEffect(() => {
    const t = setInterval(leer, CADA_CUANTO_SE_LEE);
    return () => clearInterval(t);
  }, [leer]);

  const hacer = (accion: () => Promise<void>) =>
    empezar(async () => {
      setError(null);
      try {
        await accion();
        await leer();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo hacer.');
      }
    });

  const nuevos = datos.pedidos.filter((p) => p.estado === 'NUEVO').length;
  // Lo que se lleva el sistema por los pedidos que no se cancelaron.
  const validos = datos.pedidos.filter((p) => p.estado !== 'CANCELADO');
  const cargoAcumulado = validos.reduce((suma, p) => suma + p.cargoApp, 0);

  return (
    <div className="space-y-5">
      {/* --- El interruptor de emergencia ---------------------------------------- */}
      <section
        className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 p-5 ${
          datos.abierto ? 'border-entrada bg-entrada/10' : 'border-alerta bg-alerta/10'
        }`}
      >
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-slate-400">Pedidos de la app</p>
          <p className="text-3xl font-extrabold">{datos.abierto ? '🟢 ABIERTOS' : '🔴 CERRADOS'}</p>
          <p className="text-slate-400">
            {datos.abierto
              ? 'Los clientes pueden pedir. Si algo sale mal, cerralos acá y no entra ninguno más.'
              : 'Los clientes ven el menú pero no pueden pedir. Lo que ya entró no se pierde.'}
          </p>
        </div>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => hacer(() => accionAbrirOCerrar(!datos.abierto))}
          className={`min-h-tactil rounded-2xl px-8 text-xl font-extrabold ${
            datos.abierto ? 'bg-alerta text-white' : 'bg-entrada text-black'
          }`}
        >
          {datos.abierto ? 'CERRAR YA' : 'Abrir pedidos'}
        </button>
      </section>

      {error && <p className="rounded-xl bg-alerta/20 p-3 font-semibold text-alerta">{error}</p>}

      {/* --- Los pedidos -------------------------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-xl font-bold">
          Últimas 24 horas · {datos.pedidos.length} pedido(s){nuevos > 0 ? ` · ${nuevos} nuevo(s)` : ''}
        </h2>
        {datos.pedidos.length === 0 ? (
          <p className="rounded-2xl bg-panel p-8 text-center text-slate-400">Todavía no entró ningún pedido por la app.</p>
        ) : (
          <ul className="space-y-4">
            {datos.pedidos.map((p) => (
              <FilaDePedido key={p.id} p={p} repartidores={datos.repartidores} ocupado={ocupado} hacer={hacer} />
            ))}
          </ul>
        )}
      </section>

      {/* --- Lo que gana el sistema ------------------------------------------------------- */}
      <section className="rounded-2xl bg-panel p-5">
        <h2 className="text-lg font-bold">{NOMBRE_CARGO_PLATAFORMA}</h2>
        <p className="text-slate-400">
          Cada pedido lleva {formatearMoneda(CARGO_PLATAFORMA)} por el uso de la app. En las últimas 24 horas:{' '}
          <strong className="text-white">
            {validos.length} pedido(s) · {formatearMoneda(cargoAcumulado)}
          </strong>
          .
        </p>
      </section>

      {/* --- Donde esta el local y hasta donde se entrega --------------------------------- */}
      <section className="rounded-2xl bg-panel p-5">
        <h2 className="text-lg font-bold">Ubicación de la pizzería y zona de entrega</h2>
        <p className="mb-1 text-sm text-slate-400">
          Desde este punto se miden los kilómetros hasta el cliente.{' '}
          {datos.local.configurada ? (
            <>
              Ahora está en{' '}
              <a
                className="font-bold text-sky-400 underline"
                href={enlaceDeMapa({ lat: datos.local.lat, lng: datos.local.lng })}
                target="_blank"
                rel="noreferrer"
              >
                {datos.local.lat.toFixed(5)}, {datos.local.lng.toFixed(5)}
              </a>
              , con entrega hasta {datos.local.radioKm} km.
            </>
          ) : (
            <strong className="text-aviso">
              Todavía no está puesta: se usa un punto provisional del centro de Alajuela y por eso a muchos clientes
              les sale &quot;fuera de la zona&quot;. Poné la ubicación real.
            </strong>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-[16rem] flex-1 text-sm text-slate-400">
            Coordenadas o enlace largo de Google Maps
            <input
              className="mt-1 block min-h-tactil w-full rounded-xl bg-fondo px-4 text-lg text-white ring-1 ring-borde"
              value={textoLocal}
              onChange={(e) => setTextoLocal(e.target.value)}
              placeholder="10.0163, -84.2140"
            />
          </label>
          <label className="block text-sm text-slate-400">
            Entrega hasta (km)
            <input
              className="mt-1 block min-h-tactil w-32 rounded-xl bg-fondo px-4 text-lg text-white ring-1 ring-borde"
              value={radio}
              inputMode="decimal"
              maxLength={5}
              onChange={(e) => setRadio(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </label>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => hacer(() => accionGuardarLocal(textoLocal, Number(radio)))}
            className="min-h-tactil rounded-xl bg-panelClaro px-6 text-lg font-bold"
          >
            Guardar
          </button>
        </div>
        <div className="mt-3">
          <button
            type="button"
            disabled={ocupado || buscandoGps}
            onClick={() => {
              if (!('geolocation' in navigator)) {
                setError('Este equipo no puede darme su ubicación.');
                return;
              }
              setBuscandoGps(true);
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setBuscandoGps(false);
                  hacer(() => accionGuardarLocalDesdeGps(pos.coords.latitude, pos.coords.longitude, Number(radio)));
                },
                () => {
                  setBuscandoGps(false);
                  setError('No pude leer la ubicación de este equipo. Pegá las coordenadas a mano.');
                },
                { enableHighAccuracy: true, timeout: 20_000 },
              );
            }}
            className="min-h-tactil rounded-xl bg-fondo px-5 text-lg font-bold ring-1 ring-borde"
          >
            {buscandoGps ? 'Buscando…' : '📍 Usar la ubicación de este equipo como la del local'}
          </button>
          <p className="mt-2 text-sm text-slate-500">
            Si abrís esta pantalla desde un celular parado en la pizzería, ese botón es lo más rápido. En una
            computadora la ubicación es aproximada: mejor pegá las coordenadas (en Google Maps, mantené tocado el
            punto del local y copiá los números de arriba).
          </p>
        </div>
      </section>

      {/* --- El envio ----------------------------------------------------------------------- */}
      <section className="rounded-2xl bg-panel p-5">
        <h2 className="text-lg font-bold">Cómo se cobra el envío</h2>
        <p className="mb-3 text-sm text-slate-400">
          <strong>Fijo</strong> cobra el mismo monto a todos (para las pruebas). <strong>Por distancia</strong> usa los
          tramos de kilómetros con las tarifas EXPRESS de la caja.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {(['FIJO', 'DISTANCIA'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modoEnvio === m}
                onClick={() => setModoEnvio(m)}
                className={`min-h-tactil rounded-xl px-5 text-lg font-bold ${
                  modoEnvio === m ? 'bg-entrada text-black' : 'bg-fondo text-white ring-1 ring-borde'
                }`}
              >
                {m === 'FIJO' ? 'Fijo' : 'Por distancia'}
              </button>
            ))}
          </div>
          <label className="block text-sm text-slate-400">
            Envío fijo (colones)
            <input
              className="mt-1 block min-h-tactil rounded-xl bg-fondo px-4 text-lg text-white ring-1 ring-borde"
              value={envioFijo}
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setEnvioFijo(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => hacer(() => accionGuardarEnvio(modoEnvio, Number(envioFijo || '0')))}
            className="min-h-tactil rounded-xl bg-panelClaro px-6 text-lg font-bold"
          >
            Guardar
          </button>
        </div>
      </section>

      {/* --- SINPE ------------------------------------------------------------------------ */}
      <section className="rounded-2xl bg-panel p-5">
        <h2 className="text-lg font-bold">SINPE Móvil para la app</h2>
        <p className="mb-3 text-sm text-slate-400">
          Si dejás el número vacío, la app no ofrece SINPE. Con número, el cliente lo ve al confirmar su pedido.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm text-slate-400">
            Número (8 dígitos)
            <input
              className="mt-1 block min-h-tactil rounded-xl bg-fondo px-4 text-lg text-white ring-1 ring-borde"
              value={sinpeNumero}
              inputMode="numeric"
              maxLength={9}
              onChange={(e) => setSinpeNumero(e.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-400">
            A nombre de
            <input
              className="mt-1 block min-h-tactil rounded-xl bg-fondo px-4 text-lg text-white ring-1 ring-borde"
              value={sinpeNombre}
              maxLength={60}
              onChange={(e) => setSinpeNombre(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={ocupado}
            onClick={() => hacer(() => accionGuardarSinpe(sinpeNumero, sinpeNombre))}
            className="min-h-tactil rounded-xl bg-panelClaro px-6 text-lg font-bold"
          >
            Guardar
          </button>
        </div>
      </section>
    </div>
  );
}

function FilaDePedido({
  p,
  repartidores,
  ocupado,
  hacer,
}: {
  p: PedidoParaElLocal;
  repartidores: RepartidorDeLaApp[];
  ocupado: boolean;
  hacer: (accion: () => Promise<void>) => void;
}) {
  const siguiente = SIGUIENTE[p.estado];
  const cerrado = p.estado === 'ENTREGADO' || p.estado === 'CANCELADO';

  return (
    <li className={`rounded-2xl bg-panel p-5 ${cerrado ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-3 text-2xl font-extrabold">
            #{p.numero}
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${COLOR_DE_ESTADO[p.estado]}`}>
              {NOMBRE_DE_ESTADO[p.estado]}
            </span>
            <span className="text-base font-normal text-slate-400">{hora(p.creadoEn)}</span>
          </p>
          <p className="mt-1 text-lg">
            {p.nombre} ·{' '}
            <a href={`tel:${p.telefono}`} className="font-bold text-sky-400 underline">
              {p.telefono}
            </a>
          </p>
          <p className="text-slate-300">{p.direccion}</p>
          {p.referencia && <p className="text-sm text-slate-400">Referencia: {p.referencia}</p>}
        </div>
        <p className="text-right">
          <span className="block text-3xl font-extrabold">{formatearMoneda(p.total)}</span>
          <span className="block text-xs text-slate-500">
            comida {formatearMoneda(p.subtotal)} + envío {formatearMoneda(p.envio)} + app {formatearMoneda(p.cargoApp)}
          </span>
          <span className="text-sm text-slate-400">
            {p.metodoPago === 'EFECTIVO'
              ? p.pagaCon
                ? `Efectivo · paga con ${formatearMoneda(p.pagaCon)} · vuelto ${formatearMoneda(p.pagaCon - p.total)}`
                : 'Efectivo · pago exacto'
              : p.metodoPago === 'SINPE'
                ? `SINPE ${p.pagoVerificado ? '· verificado ✓' : '· SIN verificar'}${p.referenciaPago ? ` · ref. ${p.referenciaPago}` : ''}`
                : 'Tarjeta'}
          </span>
        </p>
      </div>

      <ul className="mt-3 space-y-1 border-t border-borde pt-3">
        {p.lineas.map((l, i) => (
          <li key={i}>
            <span className="font-bold">
              {l.cantidad} × {l.nombre}
            </span>
            {l.detalle && <span className="text-slate-300"> · {l.detalle}</span>}
            {l.extras.map((e) => (
              <span key={e} className="block pl-5 text-sm text-slate-400">
                + {e}
              </span>
            ))}
            {l.notas.map((n) => (
              <span key={n} className="block pl-5 text-sm italic text-aviso">
                “{n}”
              </span>
            ))}
          </li>
        ))}
        {p.nota && <li className="text-sm italic text-aviso">Nota del pedido: “{p.nota}”</li>}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-borde pb-4">
        <label className="flex items-center gap-2 text-sm text-slate-400">
          🏍️ Lo lleva
          <select
            value={p.repartidor?.id ?? ''}
            disabled={ocupado || cerrado}
            onChange={(e) => hacer(() => accionAsignarRepartidor(p.id, e.target.value === '' ? null : e.target.value))}
            className="min-h-tactil rounded-xl bg-fondo px-3 text-lg font-bold text-white ring-1 ring-borde"
          >
            <option value="">Sin asignar</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
                {r.placa ? ` · ${r.placa}` : ' · sin moto'}
              </option>
            ))}
          </select>
        </label>
        {!p.repartidor && !cerrado && p.estado === 'EN_COCINA' && (
          <span className="text-sm text-aviso">Falta elegir quién lo lleva antes de despachar.</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {p.ubicacion ? (
          <>
            <a
              href={enlaceDeWaze(p.ubicacion)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-tactil items-center rounded-xl bg-sky-500 px-5 text-lg font-bold text-black"
            >
              🧭 Waze
            </a>
            <a
              href={enlaceDeMapa(p.ubicacion)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-tactil items-center rounded-xl bg-panelClaro px-5 text-lg font-bold"
            >
              📍 Mapa
            </a>
            <span className="text-sm text-slate-400">
              {p.distanciaKm !== null ? `${p.distanciaKm} km` : ''}
              {p.precisionM !== null ? ` · GPS ±${p.precisionM} m` : ''}
            </span>
          </>
        ) : (
          <span className="text-sm text-alerta">Sin ubicación</span>
        )}
        <span className="flex-1" />
        {p.metodoPago === 'SINPE' && !p.pagoVerificado && !cerrado && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => hacer(() => accionVerificarPago(p.id))}
            className="min-h-tactil rounded-xl bg-aviso px-5 text-lg font-bold text-black"
          >
            Ya llegó el SINPE
          </button>
        )}
        {siguiente && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => hacer(() => accionCambiarEstado(p.id, siguiente.estado))}
            className="min-h-tactil rounded-xl bg-entrada px-6 text-lg font-extrabold text-black"
          >
            {siguiente.texto}
          </button>
        )}
        {!cerrado && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm(`¿Cancelar el pedido #${p.numero}?`)) hacer(() => accionCambiarEstado(p.id, 'CANCELADO'));
            }}
            className="min-h-tactil rounded-xl bg-fondo px-5 text-lg font-bold text-alerta ring-1 ring-alerta"
          >
            Cancelar
          </button>
        )}
      </div>
    </li>
  );
}
