'use client';

/**
 * "¿Donde te entregamos?": la pantalla que se abre sola la primera vez, como en Uber
 * Eats, y que despues se abre desde la barra de arriba.
 *
 * Tres caminos:
 *  - "Usar mi ubicacion actual" (el GPS) y mover el pin si no cayo exacto;
 *  - tocar el mapa;
 *  - elegir una direccion que ya se guardo.
 *
 * Apenas hay un punto, el servidor dice si llegamos y cuanto cuesta el envio, antes de
 * que el cliente escoja un solo plato.
 */

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import { LARGO_SENAS, nuevoIdDeDireccion, tituloDeDireccion, type DireccionGuardada, type Libreta } from '@/lib/pedido/ubicacion';

import { colones, Hoja, Paso } from './ui';

// Leaflet necesita el navegador: se carga aparte y solo cuando se abre el mapa.
const MapaConPin = dynamic(() => import('./MapaConPin').then((m) => m.MapaConPin), {
  ssr: false,
  loading: () => <div className="flex h-56 items-center justify-center rounded-2xl bg-masa text-tinta/60">Cargando el mapa…</div>,
});

interface Zona {
  dentro: boolean;
  km: number;
  envio: number | null;
  cargoApp: number;
  tiempo: { desde: number; hasta: number };
}

interface Borrador {
  lat: number;
  lng: number;
  precisionM: number;
}

const ETIQUETAS = ['Casa', 'Trabajo', 'Otro'] as const;

export function SelectorDeUbicacion({
  libreta,
  alGuardar,
  alElegir,
  alQuitar,
  alCerrar,
  obligatorio,
}: {
  libreta: Libreta;
  alGuardar: (d: DireccionGuardada) => void;
  alElegir: (id: string) => void;
  alQuitar: (id: string) => void;
  alCerrar: () => void;
  /** true la primera vez: se ofrece "ahora no" para ver solo el menu. */
  obligatorio: boolean;
}) {
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [etiqueta, setEtiqueta] = useState<string>('Casa');
  const [senas, setSenas] = useState('');
  const [zona, setZona] = useState<Zona | null>(null);
  const [consultando, setConsultando] = useState(false);
  const turno = useRef(0);

  // Lo que dice el servidor sobre el punto marcado.
  useEffect(() => {
    if (!borrador) {
      setZona(null);
      return;
    }
    const mio = (turno.current += 1);
    setConsultando(true);
    const t = setTimeout(() => {
      fetch('/api/pedir/zona', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat: borrador.lat, lng: borrador.lng }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((z) => {
          if (mio === turno.current) {
            setZona(z as Zona | null);
            setConsultando(false);
          }
        })
        .catch(() => {
          if (mio === turno.current) setConsultando(false);
        });
    }, 250); // mientras arrastra el pin no se pregunta en cada pixel
    return () => clearTimeout(t);
  }, [borrador]);

  const usarGps = () => {
    setErrorGps(null);
    if (!('geolocation' in navigator)) {
      setErrorGps('Este teléfono no permite compartir la ubicación. Tocá el mapa para marcar dónde estás.');
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBorrador({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisionM: Math.round(pos.coords.accuracy) });
        setBuscando(false);
      },
      (e) => {
        setBuscando(false);
        setErrorGps(
          e.code === e.PERMISSION_DENIED
            ? 'No nos diste permiso para ver tu ubicación. Podés activarla en los ajustes del navegador, o tocar el mapa para marcar dónde estás.'
            : 'No pudimos encontrar tu ubicación. Salí a un lugar abierto y probá otra vez, o tocá el mapa.',
        );
        // Sin GPS igual se puede marcar a mano: el mapa arranca en el centro de Alajuela.
        setBorrador((b) => b ?? { lat: 10.0163, lng: -84.214, precisionM: 0 });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  };

  const puedeGuardar = borrador !== null && senas.trim().length >= 5 && zona?.dentro === true;

  const guardar = () => {
    if (!borrador || !puedeGuardar) return;
    alGuardar({
      id: nuevoIdDeDireccion(),
      etiqueta: etiqueta === 'Otro' ? '' : etiqueta,
      lat: borrador.lat,
      lng: borrador.lng,
      precisionM: borrador.precisionM,
      senas: senas.trim(),
    });
  };

  return (
    <Hoja
      titulo="¿Dónde te entregamos?"
      alCerrar={alCerrar}
      pie={
        borrador ? (
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar}
            className="min-h-[3.75rem] w-full rounded-2xl bg-albahaca px-4 text-lg font-extrabold text-white shadow-lg disabled:bg-black/20 disabled:shadow-none"
          >
            {zona && !zona.dentro
              ? 'Esa ubicación queda fuera de la zona'
              : senas.trim().length < 5
                ? 'Escribí las señas para guardarla'
                : 'Guardar y usar esta dirección'}
          </button>
        ) : obligatorio ? (
          <button type="button" onClick={alCerrar} className="min-h-[3rem] w-full rounded-2xl text-base font-bold text-tinta/70 underline">
            Ahora no, solo quiero ver el menú
          </button>
        ) : undefined
      }
    >
      {/* --- Las direcciones guardadas ----------------------------------------------- */}
      {libreta.direcciones.length > 0 && !borrador && (
        <Paso titulo="Tus direcciones">
          <ul className="space-y-2">
            {libreta.direcciones.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    alElegir(d.id);
                    alCerrar();
                  }}
                  aria-pressed={d.id === libreta.activaId}
                  className={`flex min-h-[3.75rem] flex-1 items-center gap-3 rounded-2xl px-4 text-left ${
                    d.id === libreta.activaId ? 'bg-albahaca/10 ring-2 ring-albahaca' : 'bg-white shadow-sm ring-1 ring-black/5'
                  }`}
                >
                  <span aria-hidden className="text-2xl">
                    {d.etiqueta === 'Trabajo' ? '💼' : d.etiqueta === 'Casa' ? '🏠' : '📍'}
                  </span>
                  <span className="flex-1 font-bold">{tituloDeDireccion(d, 40)}</span>
                  {d.id === libreta.activaId && <span className="font-extrabold text-albahaca">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => alQuitar(d.id)}
                  aria-label={`Borrar ${tituloDeDireccion(d, 20)}`}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-xl text-tomate shadow-sm"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </Paso>
      )}

      {/* --- Marcar una nueva ----------------------------------------------------------- */}
      <Paso titulo={libreta.direcciones.length > 0 && !borrador ? 'O agregá otra' : 'Marcá dónde estás'}>
        <button
          type="button"
          onClick={usarGps}
          disabled={buscando}
          className="flex min-h-[3.75rem] w-full items-center justify-center gap-2 rounded-2xl bg-tomate px-4 text-lg font-extrabold text-white shadow-sm"
        >
          <span aria-hidden>📍</span>
          {buscando ? 'Buscando tu ubicación…' : borrador ? 'Volver a buscar mi ubicación' : 'Usar mi ubicación actual'}
        </button>
        {errorGps && <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{errorGps}</p>}
        {!borrador && !errorGps && (
          <p className="mt-2 text-sm text-tinta/60">
            Con tu ubicación el repartidor llega a tu puerta y te decimos el envío y el tiempo antes de pedir.
          </p>
        )}
        {!borrador && (
          <button
            type="button"
            onClick={() => setBorrador({ lat: 10.0163, lng: -84.214, precisionM: 0 })}
            className="mt-3 min-h-[2.75rem] text-base font-bold text-tinta/70 underline"
          >
            Prefiero marcarla en el mapa
          </button>
        )}
      </Paso>

      {borrador && (
        <>
          <div className="mt-3">
            <MapaConPin
              lat={borrador.lat}
              lng={borrador.lng}
              alMover={(lat, lng) => setBorrador({ lat, lng, precisionM: 0 })}
            />
            <p className="mt-2 text-sm text-tinta/60">
              {borrador.precisionM > 0 ? `Precisión del GPS: unos ${borrador.precisionM} m. ` : ''}
              Tocá el mapa o arrastrá el pin hasta tu puerta.
            </p>
          </div>

          <div
            className={`mt-3 rounded-2xl p-4 text-base font-bold ${
              consultando || !zona
                ? 'bg-white text-tinta/60'
                : zona.dentro
                  ? 'bg-albahaca/10 text-albahaca'
                  : 'bg-red-50 text-red-800'
            }`}
            aria-live="polite"
          >
            {consultando || !zona ? (
              'Calculando el envío…'
            ) : zona.dentro ? (
              <>
                ✓ Llegamos · {zona.km} km · Envío {colones(zona.envio ?? 0)} · {zona.tiempo.desde}–{zona.tiempo.hasta} min
              </>
            ) : (
              <>
                Todavía no llegamos hasta ahí ({zona.km} km). Mové el pin, o llamanos al{' '}
                <a href="tel:24877021" className="underline">
                  2487-7021
                </a>
                .
              </>
            )}
          </div>

          <Paso titulo="¿Cómo le decimos?">
            <div className="flex flex-wrap gap-2">
              {ETIQUETAS.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={etiqueta === e}
                  onClick={() => setEtiqueta(e)}
                  className={`min-h-[2.75rem] rounded-full px-5 text-base font-bold ${
                    etiqueta === e ? 'bg-tomate text-white' : 'bg-white text-tinta shadow-sm ring-1 ring-black/5'
                  }`}
                >
                  {e === 'Casa' ? '🏠 ' : e === 'Trabajo' ? '💼 ' : '📍 '}
                  {e}
                </button>
              ))}
            </div>
          </Paso>

          <Paso titulo="Señas para llegar">
            <input
              type="text"
              value={senas}
              maxLength={LARGO_SENAS}
              onChange={(e) => setSenas(e.target.value)}
              placeholder="Casa verde, portón negro, frente a la escuela…"
              aria-label="Señas para llegar"
              className="min-h-[3.25rem] w-full rounded-2xl bg-white px-4 text-base shadow-sm ring-1 ring-black/10 placeholder:text-tinta/40 focus:outline-none focus:ring-2 focus:ring-tomate"
            />
            <p className="mt-1 text-sm text-tinta/60">Lo que el mapa no sabe: color de la casa, portón, referencias.</p>
          </Paso>
        </>
      )}

    </Hoja>
  );
}
