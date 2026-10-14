'use client';

/**
 * El paso de entrega y pago: donde le llevamos el pedido, quien es y como paga.
 *
 * LA UBICACION ES LO QUE MAS IMPORTA
 *
 * El boton "Usar mi ubicacion actual" pide el GPS del telefono. Con eso el
 * servidor calcula el envio y el repartidor llega con Waze hasta la puerta, sin
 * llamar a preguntar donde queda. La direccion escrita es para las senas
 * ("casa verde, porton negro"): el mapa no sabe de eso.
 *
 * Todo lo que se muestra de dinero lo calcula el servidor (/api/pedir/cotizar).
 */

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { extrasParaElServidor, totalDelCarrito, type LineaDelCarrito } from '@/lib/menu/carrito';
import { NOMBRE_CARGO_PLATAFORMA } from '@/lib/pedido/cargos';
import type { DireccionGuardada } from '@/lib/pedido/ubicacion';
import { TIEMPO_ESTIMADO, enlaceDeMapa } from '@/lib/pedido/envio';

import { colones, Tarjeta } from './ui';

const CLAVE_DATOS = 'datos-cliente-v1';

interface Ubicacion {
  lat: number;
  lng: number;
  precisionM: number;
}

interface Cotizacion {
  subtotal: number;
  envio: number;
  cargoApp: number;
  total: number;
  distanciaKm: number | null;
}

type MetodoDePago = 'EFECTIVO' | 'SINPE' | 'TARJETA';

/** Una clave unica por intento: si el cliente toca dos veces, no se crean dos pedidos. */
function nuevaClave(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function Entrega({
  carrito,
  sinpe,
  abierto,
  direccion: guardada,
  alCambiarDireccion,
  alVolver,
  alTerminar,
}: {
  carrito: LineaDelCarrito[];
  sinpe: boolean;
  abierto: boolean;
  /** La direccion que se marco al abrir la app (o la que se cambio despues). */
  direccion: DireccionGuardada | null;
  alCambiarDireccion: () => void;
  alVolver: () => void;
  alTerminar: () => void;
}) {
  const router = useRouter();
  const clave = useRef<string>(nuevaClave());

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nota, setNota] = useState('');
  // La ubicacion sale de la direccion marcada al inicio, no se vuelve a pedir aqui.
  const ubicacion: Ubicacion | null = guardada
    ? { lat: guardada.lat, lng: guardada.lng, precisionM: guardada.precisionM }
    : null;
  const direccion = guardada ? [guardada.etiqueta, guardada.senas].filter((t) => t !== '').join(': ') : '';
  const [metodo, setMetodo] = useState<MetodoDePago>('EFECTIVO');
  const [pagaCon, setPagaCon] = useState<number | null>(null); // centimos; null = exacto
  const [otroMonto, setOtroMonto] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [errorCotizacion, setErrorCotizacion] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lineas = useMemo(
    () =>
      carrito.map((l) => ({
        varianteId: l.varianteId,
        cantidad: l.cantidad,
        extras: extrasParaElServidor(l.extras),
        notas: l.notas,
      })),
    [carrito],
  );
  const subtotalLocal = totalDelCarrito(carrito);

  // Lo que el cliente ya escribio la vez pasada.
  useEffect(() => {
    try {
      const guardado = JSON.parse(window.localStorage.getItem(CLAVE_DATOS) ?? 'null') as {
        nombre?: string;
        telefono?: string;
      } | null;
      if (guardado) {
        setNombre(guardado.nombre ?? '');
        setTelefono(guardado.telefono ?? '');
      }
    } catch {
      /* sin datos guardados */
    }
  }, []);

  // El envio y el total, calculados por el servidor, apenas hay ubicacion.
  const ubicacionLat = ubicacion?.lat;
  const ubicacionLng = ubicacion?.lng;
  useEffect(() => {
    // Con el carrito vacio (recien confirmado) no hay nada que cotizar.
    if (ubicacionLat === undefined || ubicacionLng === undefined || lineas.length === 0) {
      setCotizacion(null);
      return;
    }
    let vigente = true;
    setErrorCotizacion(null);
    fetch('/api/pedir/cotizar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineas, lat: ubicacionLat, lng: ubicacionLng }),
    })
      .then(async (r) => {
        const datos = await r.json();
        if (!vigente) return;
        if (r.ok) setCotizacion(datos as Cotizacion);
        else {
          setCotizacion(null);
          setErrorCotizacion((datos as { error?: string }).error ?? 'No pudimos calcular el envío.');
        }
      })
      .catch(() => {
        if (vigente) setErrorCotizacion('No pudimos calcular el envío. Revisá tu conexión.');
      });
    return () => {
      vigente = false;
    };
  }, [ubicacionLat, ubicacionLng, lineas]);

  const total = cotizacion?.total ?? null;

  // Sugerencias de "con cuanto pagas": los billetes redondos que alcanzan.
  const sugerencias = useMemo(() => {
    if (total === null) return [];
    const redondos = [500000, 1000000, 2000000, 5000000, 10000000];
    const salida = new Set<number>();
    for (const paso of redondos) {
      const arriba: number = Math.ceil(total / paso) * paso;
      if (arriba >= total && arriba !== total) salida.add(arriba);
    }
    return [...salida].sort((a, b) => a - b).slice(0, 3);
  }, [total]);

  const puedeConfirmar =
    abierto &&
    !enviando &&
    ubicacion !== null &&
    cotizacion !== null &&
    nombre.trim().length >= 2 &&
    telefono.replace(/\D/g, '').length >= 8 &&
    direccion.trim().length >= 5 &&
    metodo !== 'TARJETA';

  const confirmar = async () => {
    if (!puedeConfirmar || !ubicacion) return;
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await fetch('/api/pedir', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clave: clave.current,
          nombre,
          telefono,
          direccion,
          referencia: null,
          lat: ubicacion.lat,
          lng: ubicacion.lng,
          precisionM: ubicacion.precisionM,
          metodoPago: metodo,
          pagaCon: metodo === 'EFECTIVO' ? pagaCon : null,
          referenciaPago: metodo === 'SINPE' ? referenciaPago || null : null,
          nota: nota || null,
          lineas,
        }),
      });
      const datos = (await respuesta.json()) as { id?: string; error?: string };
      if (!respuesta.ok || !datos.id) {
        setError(datos.error ?? 'No pudimos guardar tu pedido. Probá de nuevo.');
        setEnviando(false);
        return;
      }
      try {
        window.localStorage.setItem(CLAVE_DATOS, JSON.stringify({ nombre, telefono }));
      } catch {
        /* no pasa nada */
      }
      alTerminar();
      router.push(`/pedir/pedido/${datos.id}`);
    } catch {
      setError('No pudimos conectar. Revisá tu internet y probá de nuevo: no se duplica el pedido.');
      setEnviando(false);
    }
  };

  const campo =
    'min-h-[3.25rem] w-full rounded-2xl bg-crema px-4 text-base ring-1 ring-black/10 placeholder:text-tinta/40 focus:outline-none focus:ring-2 focus:ring-tomate';

  return (
    <div className="mx-auto max-w-xl pb-40">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-crema/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={alVolver}
          aria-label="Volver al menú"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-2xl shadow-sm"
        >
          ←
        </button>
        <h1 className="text-xl font-extrabold">Entrega y pago</h1>
      </header>

      <div className="space-y-4 px-4 pt-2">
        <Tarjeta titulo="¿Dónde te lo llevamos?">
          {guardada ? (
            <div className="flex items-center gap-3">
              <span aria-hidden className="text-3xl">
                {guardada.etiqueta === 'Trabajo' ? '💼' : guardada.etiqueta === 'Casa' ? '🏠' : '📍'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">{guardada.etiqueta || 'Ubicación marcada'}</p>
                <p className="text-tinta/80">{guardada.senas}</p>
                <a
                  href={enlaceDeMapa({ lat: guardada.lat, lng: guardada.lng })}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-bold text-tomate underline"
                >
                  Ver en el mapa
                </a>
              </div>
              <button
                type="button"
                onClick={alCambiarDireccion}
                className="min-h-[2.75rem] shrink-0 rounded-full bg-crema px-4 text-base font-bold ring-1 ring-black/10"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={alCambiarDireccion}
              className="flex min-h-[3.75rem] w-full items-center justify-center gap-2 rounded-2xl bg-tomate px-4 text-lg font-extrabold text-white shadow-sm"
            >
              <span aria-hidden>📍</span>
              Marcar dónde te entregamos
            </button>
          )}
        </Tarjeta>

        <Tarjeta titulo="¿Quién recibe?">
          <label className="block text-sm font-bold text-tinta/70" htmlFor="nom">
            Nombre
          </label>
          <input
            id="nom"
            className={`${campo} mt-1`}
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="name"
          />
          <label className="mt-3 block text-sm font-bold text-tinta/70" htmlFor="tel">
            Teléfono
          </label>
          <input
            id="tel"
            className={`${campo} mt-1`}
            value={telefono}
            maxLength={20}
            inputMode="tel"
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="8888-7777"
            autoComplete="tel"
          />
        </Tarjeta>

        <Tarjeta titulo="¿Cómo pagás?">
          <div className="space-y-2">
            <OpcionDePago
              activo={metodo === 'EFECTIVO'}
              alTocar={() => setMetodo('EFECTIVO')}
              icono="💵"
              titulo="Efectivo"
              detalle="Le pagás al repartidor al recibir"
            />
            {sinpe && (
              <OpcionDePago
                activo={metodo === 'SINPE'}
                alTocar={() => setMetodo('SINPE')}
                icono="📲"
                titulo="SINPE Móvil"
                detalle="Te damos el número al confirmar"
              />
            )}
            <OpcionDePago
              activo={false}
              alTocar={() => undefined}
              icono="💳"
              titulo="Tarjeta"
              detalle="Próximamente"
              deshabilitada
            />
          </div>

          {metodo === 'EFECTIVO' && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-bold text-tinta/70">¿Con cuánto pagás? (para llevarte el vuelto)</p>
              <div className="flex flex-wrap gap-2">
                <Chip activo={pagaCon === null && otroMonto === ''} alTocar={() => { setPagaCon(null); setOtroMonto(''); }}>
                  Pago exacto
                </Chip>
                {sugerencias.map((s) => (
                  <Chip key={s} activo={pagaCon === s} alTocar={() => { setPagaCon(s); setOtroMonto(''); }}>
                    {colones(s)}
                  </Chip>
                ))}
              </div>
              <input
                className={`${campo} mt-3`}
                inputMode="numeric"
                value={otroMonto}
                placeholder="Otro monto, en colones"
                aria-label="Otro monto con el que pagás"
                onChange={(e) => {
                  const digitos = e.target.value.replace(/\D/g, '').slice(0, 8);
                  setOtroMonto(digitos);
                  setPagaCon(digitos === '' ? null : Number(digitos) * 100);
                }}
              />
              {pagaCon !== null && total !== null && pagaCon < total && (
                <p className="mt-2 text-sm font-semibold text-red-700">Con ese monto no alcanza para el total.</p>
              )}
            </div>
          )}

          {metodo === 'SINPE' && (
            <div className="mt-4">
              <label className="block text-sm font-bold text-tinta/70" htmlFor="refpago">
                Número de comprobante (si ya pagaste)
              </label>
              <input
                id="refpago"
                className={`${campo} mt-1`}
                value={referenciaPago}
                maxLength={40}
                onChange={(e) => setReferenciaPago(e.target.value)}
                placeholder="Lo podés poner después también"
              />
              <p className="mt-2 text-sm text-tinta/60">
                Al confirmar te mostramos el número y el monto exacto para el SINPE.
              </p>
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="¿Algo más para tu pedido?">
          <input
            className={campo}
            value={nota}
            maxLength={200}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Una nota para el repartidor o la cocina"
            aria-label="Una nota para el pedido"
          />
        </Tarjeta>

        <Tarjeta titulo="Resumen">
          <dl className="space-y-2 text-base">
            <Linea etiqueta="Subtotal" valor={colones(cotizacion?.subtotal ?? subtotalLocal)} />
            <Linea
              etiqueta={`Envío${cotizacion?.distanciaKm != null ? ` (${cotizacion.distanciaKm} km)` : ''}`}
              valor={cotizacion ? colones(cotizacion.envio) : 'con tu ubicación'}
            />
            {cotizacion && cotizacion.cargoApp > 0 && (
              <Linea etiqueta={NOMBRE_CARGO_PLATAFORMA} valor={colones(cotizacion.cargoApp)} />
            )}
            <div className="flex items-baseline justify-between border-t border-black/10 pt-3 text-xl font-extrabold">
              <dt>Total</dt>
              <dd>{cotizacion ? colones(cotizacion.total) : '—'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-tinta/60">
            Entrega estimada: {TIEMPO_ESTIMADO.desde}–{TIEMPO_ESTIMADO.hasta} minutos.
          </p>
          {errorCotizacion && (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">
              <p>{errorCotizacion}</p>
              <button type="button" onClick={alVolver} className="mt-2 min-h-[2.75rem] rounded-full bg-white px-4 font-bold underline">
                Volver y revisar mi pedido
              </button>
            </div>
          )}
        </Tarjeta>

        {!abierto && (
          <p className="rounded-2xl bg-amber-100 p-4 text-base font-semibold text-amber-900">
            Por ahora no estamos recibiendo pedidos por la app. Llamanos al{' '}
            <a href="tel:24877021" className="underline">
              2487-7021
            </a>
            .
          </p>
        )}
        {error && <p className="rounded-2xl bg-red-50 p-4 text-base font-semibold text-red-800">{error}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-crema via-crema to-transparent px-4 pb-4 pt-8">
        <button
          type="button"
          onClick={confirmar}
          disabled={!puedeConfirmar}
          className="mx-auto flex min-h-[4rem] w-full max-w-xl items-center justify-between rounded-2xl bg-albahaca px-5 text-lg font-extrabold text-white shadow-xl disabled:bg-black/25 disabled:shadow-none"
        >
          <span>{enviando ? 'Enviando tu pedido…' : ubicacion ? 'Confirmar pedido' : 'Primero marcá dónde te entregamos'}</span>
          {cotizacion && <span>{colones(cotizacion.total)}</span>}
        </button>
      </div>
    </div>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-tinta/70">{etiqueta}</dt>
      <dd className="font-bold">{valor}</dd>
    </div>
  );
}

function Chip({ activo, alTocar, children }: { activo: boolean; alTocar: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={alTocar}
      aria-pressed={activo}
      className={`min-h-[2.75rem] rounded-full px-4 text-base font-bold ${
        activo ? 'bg-albahaca text-white' : 'bg-crema text-tinta ring-1 ring-black/10'
      }`}
    >
      {children}
    </button>
  );
}

function OpcionDePago({
  activo,
  alTocar,
  icono,
  titulo,
  detalle,
  deshabilitada,
}: {
  activo: boolean;
  alTocar: () => void;
  icono: string;
  titulo: string;
  detalle: string;
  deshabilitada?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={alTocar}
      disabled={deshabilitada}
      aria-pressed={activo}
      className={`flex min-h-[4rem] w-full items-center gap-3 rounded-2xl px-4 text-left transition disabled:opacity-45 ${
        activo ? 'bg-albahaca/10 ring-2 ring-albahaca' : 'bg-crema ring-1 ring-black/10'
      }`}
    >
      <span aria-hidden className="text-3xl">
        {icono}
      </span>
      <span className="flex-1">
        <span className="block text-lg font-extrabold">{titulo}</span>
        <span className="block text-sm text-tinta/60">{detalle}</span>
      </span>
      <span
        aria-hidden
        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
          activo ? 'border-albahaca bg-albahaca text-white' : 'border-black/25'
        }`}
      >
        {activo ? '✓' : ''}
      </span>
    </button>
  );
}
