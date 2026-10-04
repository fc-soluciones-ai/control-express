'use client';

/**
 * La pantalla que abre el cliente desde WhatsApp.
 *
 * Es la unica pantalla del sistema que ve alguien de afuera, en su propio
 * telefono, probablemente de noche y con una mano. De ahi vienen casi todas
 * las decisiones:
 *
 * UN SOLO BOTON GRANDE. Nada de formularios. Se toca, el telefono pregunta si
 * da el permiso, y listo.
 *
 * NO SE DIBUJA UN MAPA. Un mapa ayudaria a confirmar, pero cargar las
 * imagenes de un mapa manda la ubicacion del cliente a un tercero antes de
 * que el cliente haya aceptado compartirla con nosotros, que es justo lo
 * contrario de lo que dice el permiso que esta leyendo. En su lugar se
 * muestra que tan exacta quedo y un enlace que el cliente abre si quiere
 * verla.
 *
 * SE PUEDE DECIR QUE NO. El enlace para no compartirla esta a la vista, no
 * escondido. Un cliente que se siente presionado bloquea el numero, y con el
 * numero bloqueado se pierden tambien los pedidos.
 */

import { useState } from 'react';

import { TEXTO_CONSENTIMIENTO } from '@/lib/clientes/consentimiento';
import { primerNombre } from '@/lib/clientes/normalizar';

/** Arriba de esto el punto no sirve para encontrar una casa en un barrio. */
const PRECISION_MAXIMA_METROS = 100;

interface Punto {
  latitud: number;
  longitud: number;
  precisionMetros: number | null;
}

interface Props {
  token: string;
  nombreCliente: string;
  direccionActual: string;
  yaRespondio: boolean;
  alGuardar: (datos: {
    token: string;
    latitud: number;
    longitud: number;
    precisionMetros: number | null;
    nota: string;
  }) => Promise<{ ok: true } | { ok: false; mensaje: string }>;
  alRechazar: (token: string) => Promise<void>;
}

export function PanelUbicacionCliente({
  token,
  nombreCliente,
  direccionActual,
  yaRespondio,
  alGuardar,
  alRechazar,
}: Props) {
  const [punto, setPunto] = useState<Punto | null>(null);
  const [nota, setNota] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(yaRespondio);
  const [rechazado, setRechazado] = useState(false);

  // El mismo saludo que lleva el mensaje de WhatsApp, por la misma razon.
  const saludo = primerNombre(nombreCliente);

  function pedirUbicacion() {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('Este telefono no puede compartir la ubicacion desde el navegador.');
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setBuscando(false);
        setPunto({
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
          precisionMetros: Number.isFinite(posicion.coords.accuracy)
            ? posicion.coords.accuracy
            : null,
        });
      },
      (fallo) => {
        setBuscando(false);
        // Los tres motivos que manda el navegador, dichos como los entiende
        // alguien que no sabe que es una API de geolocalizacion.
        if (fallo.code === fallo.PERMISSION_DENIED) {
          setError(
            'Su telefono no nos dio permiso. Toque de nuevo el boton y elija "Permitir" ' +
              'cuando le pregunte.',
          );
        } else if (fallo.code === fallo.POSITION_UNAVAILABLE) {
          setError(
            'Su telefono no logro ubicarse. Revise que tenga el GPS encendido y vuelva a intentarlo.',
          );
        } else {
          setError('Tardo demasiado. Salga al patio o a la calle y vuelva a intentarlo.');
        }
      },
      // enableHighAccuracy pide el GPS de verdad y no la antena de celular,
      // que en Alajuela se equivoca por kilometros. Gasta mas bateria: da
      // igual, es una sola vez.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function guardar() {
    if (!punto) return;
    setGuardando(true);
    setError(null);
    const resultado = await alGuardar({ token, ...punto, nota });
    setGuardando(false);
    if (resultado.ok) setListo(true);
    else setError(resultado.mensaje);
  }

  async function rechazar() {
    await alRechazar(token);
    setRechazado(true);
  }

  // --- Lo que ve despues de mandarla ---------------------------------------
  if (listo) {
    return (
      <Marco>
        <div className="text-center">
          <p className="text-6xl">✅</p>
          <h1 className="mt-4 text-2xl font-bold">Listo{saludo ? `, ${saludo}` : ''}</h1>
          <p className="mt-3 text-slate-300">
            Ya tenemos su ubicacion. De ahora en adelante el pedido le va a llegar sin que
            tengamos que llamarle a preguntar la direccion.
          </p>
          <p className="mt-6 text-sm text-slate-500">Gracias por el tiempo. Ya puede cerrar esta pagina.</p>
        </div>
      </Marco>
    );
  }

  if (rechazado) {
    return (
      <Marco>
        <div className="text-center">
          <p className="text-5xl">👍</p>
          <h1 className="mt-4 text-xl font-bold">Sin problema</h1>
          <p className="mt-3 text-slate-300">
            No le vamos a volver a preguntar. Seguimos usando la direccion que ya tenemos.
          </p>
        </div>
      </Marco>
    );
  }

  const precisionMala =
    punto?.precisionMetros != null && punto.precisionMetros > PRECISION_MAXIMA_METROS;

  // --- La pantalla normal ---------------------------------------------------
  return (
    <Marco>
      <h1 className="text-2xl font-bold">
        Hola{saludo ? ` ${saludo}` : ''} 👋
      </h1>
      <p className="mt-2 text-slate-300">
        Queremos llevarle los pedidos mas rapido y sin llamarle a preguntar donde vive.
      </p>

      {direccionActual.trim() !== '' && (
        <div className="mt-5 rounded-2xl border border-borde bg-panelClaro p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            La direccion que tenemos hoy
          </p>
          <p className="mt-1 text-slate-200">{direccionActual}</p>
        </div>
      )}

      {!punto && (
        <>
          <button
            type="button"
            onClick={pedirUbicacion}
            disabled={buscando}
            className="boton-tactil mt-6 w-full bg-entrada text-slate-950 disabled:opacity-60"
          >
            {buscando ? 'Buscando su ubicacion...' : '📍 Compartir mi ubicacion'}
          </button>
          <p className="mt-3 text-center text-xs text-slate-500">
            Su telefono le va a preguntar si nos da permiso. Toque &quot;Permitir&quot;.
          </p>
        </>
      )}

      {punto && (
        <div className="mt-6">
          <div
            className={`rounded-2xl p-4 ${
              precisionMala ? 'bg-alerta/15' : 'bg-entrada/15'
            }`}
          >
            <p className="font-bold">
              {precisionMala ? 'La ubicacion quedo imprecisa' : 'Ubicacion tomada'}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {punto.precisionMetros == null
                ? 'Su telefono no dijo que tan exacta es.'
                : `Su telefono dice que puede estar equivocada por ${Math.round(
                    punto.precisionMetros,
                  )} metros.`}
            </p>
            {precisionMala && (
              <p className="mt-2 text-sm text-slate-300">
                Con ese margen el repartidor no encuentra la casa. Si puede, salga al patio o a
                la calle y tomela otra vez.
              </p>
            )}
            <a
              href={`https://www.openstreetmap.org/?mlat=${punto.latitud}&mlon=${punto.longitud}#map=18/${punto.latitud}/${punto.longitud}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-entrada underline"
            >
              Ver en el mapa
            </a>
          </div>

          <label className="mt-5 block">
            <span className="text-sm text-slate-300">
              ¿Algo que ayude a encontrarla? (opcional)
            </span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Porton verde, segunda casa, el perro ladra"
              className="mt-2 w-full rounded-2xl border border-borde bg-panelClaro p-3 text-base text-slate-100 outline-none focus:border-entrada"
            />
          </label>

          <p className="mt-4 rounded-2xl bg-fondo p-3 text-xs leading-relaxed text-slate-400">
            {TEXTO_CONSENTIMIENTO}
          </p>

          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="boton-tactil mt-4 w-full bg-entrada text-slate-950 disabled:opacity-60"
          >
            {guardando ? 'Enviando...' : 'Acepto y envio mi ubicacion'}
          </button>
          <button
            type="button"
            onClick={pedirUbicacion}
            disabled={buscando}
            className="boton-tactil mt-2 w-full border border-borde bg-panelClaro text-slate-300"
          >
            {buscando ? 'Buscando...' : 'Tomarla otra vez'}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-2xl bg-alerta/15 p-3 text-center text-sm text-alerta">{error}</p>
      )}

      <button
        type="button"
        onClick={rechazar}
        className="mt-8 w-full text-sm text-slate-500 underline"
      >
        Prefiero no compartirla
      </button>
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-5 py-8">
      <div className="tarjeta p-6">{children}</div>
      <p className="mt-6 text-center text-xs text-slate-600">
        Si no esperaba este mensaje, no toque nada y avisenos.
      </p>
    </main>
  );
}
