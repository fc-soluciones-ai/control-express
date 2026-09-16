'use client';

/**
 * Carga de gasolina desde el telefono del repartidor.
 *
 * Dos fotos y nada mas: el odometro y la factura. La IA lee en el servidor el
 * kilometraje, el monto, la fecha y la gasolinera, y la pantalla solo los
 * muestra. No hay donde teclearlos: asi el numero que queda es el de la foto,
 * no el que alguien quiera poner.
 *
 * Si una foto no se lee, se toma otra. Si no hay manera, la gasolina la
 * registra la caja.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { accionCargarGasolina, accionLeerFoto } from '@/app/mi/acciones';
import { encogerImagen } from '@/lib/imagen';
import { formatearMoneda } from '@/lib/money/money';
import type { ResumenDelRepartidor } from '@/server/services/repartidor';
import type { LecturaParaPantalla, TipoLectura } from '@/server/services/lectura-ia';

interface Props {
  moto: ResumenDelRepartidor['moto'];
  iaLista: boolean;
}

interface EstadoFoto {
  leyendo: boolean;
  vista: string | null;
  lectura: LecturaParaPantalla | null;
  error: string | null;
}

const VACIO: EstadoFoto = { leyendo: false, vista: null, lectura: null, error: null };

function TarjetaFoto({
  numero,
  titulo,
  ayuda,
  estado,
  alElegir,
  children,
}: {
  numero: number;
  titulo: string;
  ayuda: string;
  estado: EstadoFoto;
  alElegir: (archivo: File) => void;
  children: React.ReactNode;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const leida = estado.lectura?.legible;

  return (
    <section className="tarjeta p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {numero}. {titulo}
      </p>

      <div className="mt-3 flex gap-4">
        {estado.vista ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={estado.vista}
            alt=""
            className="h-24 w-24 shrink-0 rounded-xl border border-borde object-cover"
          />
        ) : null}

        <div className="min-w-0 flex-1">
          {estado.leyendo ? (
            <p className="text-lg text-slate-300">Leyendo la foto...</p>
          ) : leida ? (
            children
          ) : estado.lectura ? (
            <p className="text-aviso">
              No se pudo leer: {estado.lectura.motivo ?? 'la foto no es clara'}. Tome otra.
            </p>
          ) : (
            <p className="text-slate-400">{ayuda}</p>
          )}
          {estado.error ? <p className="mt-2 text-alerta">{estado.error}</p> : null}
          {leida && estado.lectura?.observacion ? (
            <p className="mt-2 text-xs text-aviso">Nota: {estado.lectura.observacion}</p>
          ) : null}
        </div>
      </div>

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = '';
          if (archivo) alElegir(archivo);
        }}
      />
      <button
        type="button"
        disabled={estado.leyendo}
        onClick={() => entrada.current?.click()}
        className={`boton-tactil mt-4 w-full ${
          leida
            ? 'border border-borde bg-panelClaro text-slate-300'
            : 'bg-entrada text-slate-950'
        } disabled:opacity-50`}
      >
        📷 {estado.lectura ? 'Tomar otra foto' : 'Tomar foto'}
      </button>
    </section>
  );
}

export function FormularioGasolina({ moto, iaLista }: Props) {
  const router = useRouter();

  const [odometro, setOdometro] = useState<EstadoFoto>(VACIO);
  const [factura, setFactura] = useState<EstadoFoto>(VACIO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<{
    placa: string;
    km: number;
    monto: number;
  } | null>(null);

  // Una sola clave mientras la pantalla siga abierta: si el dedo rebota, no
  // se cobra dos veces el mismo tanque.
  const clave = useRef<string>(crypto.randomUUID());

  // Las vistas previas ocupan memoria hasta que se sueltan.
  const vistas = useRef<string[]>([]);
  useEffect(() => () => vistas.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const leer = useCallback(
    async (tipo: TipoLectura, original: File) => {
      const poner = tipo === 'ODOMETRO' ? setOdometro : setFactura;
      const vista = URL.createObjectURL(original);
      vistas.current.push(vista);
      poner({ leyendo: true, vista, lectura: null, error: null });
      setError(null);

      const archivo = await encogerImagen(original);
      const datos = new FormData();
      datos.set('tipo', tipo);
      datos.set('archivo', archivo);

      let respuesta: Awaited<ReturnType<typeof accionLeerFoto>>;
      try {
        respuesta = await accionLeerFoto(datos);
      } catch {
        respuesta = { ok: false, mensaje: 'Sin conexion. Intente de nuevo.' };
      }
      poner({
        leyendo: false,
        vista,
        lectura: respuesta.ok ? respuesta.datos : null,
        error: respuesta.ok ? null : respuesta.mensaje,
      });
      // Otra foto es otro registro: la clave anterior ya no aplica.
      clave.current = crypto.randomUUID();
    },
    [],
  );

  const km = odometro.lectura?.legible ? odometro.lectura.kilometraje : null;
  const fac = factura.lectura?.legible ? factura.lectura : null;
  const odometroBajo = moto !== null && km !== null && km < moto.kilometraje;
  const listo = km !== null && fac !== null && !odometroBajo;

  const guardar = useCallback(async () => {
    if (enviando || !listo || !odometro.lectura || !factura.lectura) return;
    setEnviando(true);
    setError(null);

    let respuesta: Awaited<ReturnType<typeof accionCargarGasolina>>;
    try {
      respuesta = await accionCargarGasolina({
        lecturaOdometroId: odometro.lectura.id,
        lecturaFacturaId: factura.lectura.id,
        claveIdempotencia: clave.current,
      });
    } catch {
      respuesta = { ok: false, mensaje: 'Sin conexion. Intente de nuevo.' };
    }
    setEnviando(false);

    if (!respuesta.ok) {
      setError(respuesta.mensaje);
      return;
    }
    setGuardado({
      placa: respuesta.datos.placa,
      km: respuesta.datos.kilometraje,
      monto: respuesta.datos.monto,
    });
    router.refresh();
  }, [enviando, factura.lectura, listo, odometro.lectura, router]);

  if (!moto) {
    return (
      <main className="mx-auto max-w-lg p-5">
        <div className="tarjeta p-8 text-center">
          <p className="text-5xl">🏍️</p>
          <h1 className="mt-4 text-xl font-bold">Hoy no tiene moto asignada</h1>
          <p className="mt-2 text-slate-400">
            Sin moto no hay a cual cargarle la gasolina. Digale a la caja que le asigne una.
          </p>
          <Link href="/mi" className="boton-tactil mt-6 inline-flex bg-entrada px-8 text-slate-950">
            Volver
          </Link>
        </div>
      </main>
    );
  }

  if (guardado) {
    return (
      <main className="mx-auto max-w-lg p-5">
        <div className="tarjeta p-6 text-center">
          <p className="text-6xl">✅</p>
          <h1 className="mt-4 text-2xl font-bold">Gasolina registrada</h1>
          <p className="cifra mt-2 text-3xl font-bold text-entrada">
            {formatearMoneda(guardado.monto)}
          </p>
          <p className="cifra mt-1 text-slate-400">
            {guardado.placa} · odometro en {guardado.km.toLocaleString('es-CR')} km
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Las dos fotos quedaron guardadas como comprobante.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="boton-tactil bg-entrada text-slate-950"
              onClick={() => {
                clave.current = crypto.randomUUID();
                setOdometro(VACIO);
                setFactura(VACIO);
                setGuardado(null);
              }}
            >
              Cargar otra vez
            </button>
            <Link
              href="/mi"
              className="boton-tactil border border-borde bg-panelClaro text-slate-200"
            >
              Volver
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cargar gasolina</h1>
          <p className="cifra text-sm text-slate-400">
            {moto.placa} · {moto.marca} {moto.modelo}
          </p>
        </div>
        <Link
          href="/mi"
          className="rounded-xl border border-borde px-4 py-2 text-sm text-slate-400 active:scale-95"
        >
          Volver
        </Link>
      </header>

      {!iaLista ? (
        <p className="mt-5 rounded-2xl bg-aviso/15 p-4 text-center text-aviso">
          La lectura de fotos todavia no esta configurada. Por ahora la gasolina la registra la
          caja.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-4">
            <TarjetaFoto
              numero={1}
              titulo="Foto del odometro"
              ayuda="Enfoque el tablero de cerca, que se lean bien los numeros del kilometraje."
              estado={odometro}
              alElegir={(f) => leer('ODOMETRO', f)}
            >
              <p className="cifra text-3xl font-bold">
                {km?.toLocaleString('es-CR')} km
              </p>
              <p className="mt-1 text-xs text-slate-500">
                La moto marcaba {moto.kilometraje.toLocaleString('es-CR')} km.
              </p>
            </TarjetaFoto>

            <TarjetaFoto
              numero={2}
              titulo="Foto de la factura"
              ayuda="La factura completa y derecha, que se lean el total y la fecha."
              estado={factura}
              alElegir={(f) => leer('FACTURA', f)}
            >
              {fac ? (
                <>
                  <p className="cifra text-3xl font-bold text-entrada">
                    {formatearMoneda(fac.monto ?? 0)}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">{fac.gasolinera ?? 'Gasolinera sin nombre'}</p>
                  <p className="cifra text-xs text-slate-500">
                    {fac.fechaFactura}
                    {fac.litros ? ` · ${fac.litros} L` : ''}
                    {fac.numeroFactura ? ` · Fact. ${fac.numeroFactura}` : ''}
                  </p>
                </>
              ) : null}
            </TarjetaFoto>
          </div>

          {odometroBajo ? (
            <p className="mt-4 rounded-2xl bg-aviso/15 p-4 text-center text-aviso">
              Se leyo menos de lo que ya marcaba la moto ({moto.kilometraje.toLocaleString('es-CR')}{' '}
              km). Tome otra foto del odometro.
            </p>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-2xl bg-alerta/15 p-4 text-center text-alerta" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={guardar}
            disabled={!listo || enviando}
            className="boton-tactil mt-5 h-20 w-full bg-entrada text-xl text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
          >
            {enviando
              ? 'Guardando...'
              : listo
                ? `Guardar ${formatearMoneda(fac?.monto ?? 0)}`
                : 'Faltan las dos fotos'}
          </button>

          <p className="mt-4 text-center text-xs text-slate-600">
            Los datos se leen de las fotos y no se pueden cambiar. Queda registrado a su nombre.
          </p>
        </>
      )}
    </main>
  );
}
