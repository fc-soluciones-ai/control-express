'use client';

/**
 * El acta de entrega de una moto: como estaba cuando se le dio al repartidor.
 *
 * No es una lista libre de fotos sino una por angulo (adelante, atras, los dos
 * lados y arriba) y dos para detalles que ya traia. Con la lista a la vista se
 * nota cual falta, y despues nadie puede decir que un rayon no estaba.
 *
 * Una foto tomada no se reemplaza tomando otra: hay que borrarla primero, y
 * el borrado queda en la bitacora con el nombre de quien lo hizo.
 */

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { accionBorrarEvidencia, accionSubirEvidencia } from '@/app/motos/acciones';
import { encogerImagen } from '@/lib/imagen';
import { TIPOS_DE_FOTO, type Evidencia } from '@/server/services/evidencia';

interface Props {
  /** Null mientras la moto no existe. */
  placa: string | null;
  evidencia: Evidencia[];
  bloqueado?: boolean;
}

interface Casilla {
  clave: string;
  tipo: string;
  etiqueta: string;
  icono: string;
  nota: string;
  foto: Evidencia | null;
}

/** Una casilla por cada foto que cabe: los angulos una, los detalles dos. */
function casillas(fotos: Evidencia[]): Casilla[] {
  return TIPOS_DE_FOTO.MOTOCICLETA.flatMap((t) => {
    const delTipo = fotos
      .filter((f) => f.tipo === t.valor)
      .sort((a, b) => new Date(a.tomadaEn).getTime() - new Date(b.tomadaEn).getTime());
    const cupo = t.cupo ?? 1;
    return Array.from({ length: cupo }, (_, i) => ({
      clave: `${t.valor}-${i}`,
      tipo: t.valor,
      etiqueta: cupo > 1 ? `${t.etiqueta} ${i + 1}` : t.etiqueta,
      icono: t.icono,
      nota: t.nota,
      foto: delTipo[i] ?? null,
    }));
  });
}

export function PanelEntregaMoto({ placa, evidencia, bloqueado = false }: Props) {
  const router = useRouter();
  const archivoRef = useRef<HTMLInputElement>(null);

  // Lo subido o borrado aqui, mientras llega la lista nueva del servidor.
  const [nuevas, setNuevas] = useState<Evidencia[]>([]);
  const [borradas, setBorradas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<Casilla | null>(null);
  const [detalle, setDetalle] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vistas = new Set(evidencia.map((f) => f.id));
  const fotos = [...nuevas.filter((f) => !vistas.has(f.id)), ...evidencia].filter(
    (f) => !borradas.has(f.id),
  );
  const lista = casillas(fotos);
  const angulos = lista.filter((c) => c.tipo !== 'DETALLE');
  const listos = angulos.filter((c) => c.foto).length;

  const subir = useCallback(
    async (archivo: File, casilla: Casilla, descripcion: string) => {
      if (!placa) return;
      setTrabajando(casilla.clave);
      setError(null);
      const encogida = await encogerImagen(archivo);
      const cuerpo = new FormData();
      cuerpo.set('entidadTipo', 'MOTOCICLETA');
      cuerpo.set('entidadId', placa);
      cuerpo.set('tipo', casilla.tipo);
      cuerpo.set('descripcion', descripcion);
      cuerpo.set('archivo', encogida, encogida.name);

      let respuesta: Awaited<ReturnType<typeof accionSubirEvidencia>>;
      try {
        respuesta = await accionSubirEvidencia(cuerpo);
      } catch {
        respuesta = { ok: false, mensaje: 'Sin conexion. Intente de nuevo.' };
      }
      setTrabajando(null);
      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }
      setNuevas((previas) => [respuesta.datos.foto, ...previas]);
      setDestino(null);
      setDetalle('');
      router.refresh();
    },
    [placa, router],
  );

  const borrar = useCallback(
    async (casilla: Casilla) => {
      if (!casilla.foto) return;
      const id = casilla.foto.id;
      setTrabajando(casilla.clave);
      setError(null);
      let respuesta: Awaited<ReturnType<typeof accionBorrarEvidencia>>;
      try {
        respuesta = await accionBorrarEvidencia(id);
      } catch {
        respuesta = { ok: false, mensaje: 'Sin conexion. Intente de nuevo.' };
      }
      setTrabajando(null);
      setConfirmar(null);
      if (!respuesta.ok) {
        setError(respuesta.mensaje);
        return;
      }
      setBorradas((previas) => new Set(previas).add(id));
      router.refresh();
    },
    [router],
  );

  const abrirCamara = (casilla: Casilla) => {
    setDestino(casilla);
    setError(null);
    // Los angulos no piden nada: se dispara la camara de una vez. El detalle
    // primero pide que se anote que es.
    if (casilla.tipo !== 'DETALLE') {
      requestAnimationFrame(() => archivoRef.current?.click());
    }
  };

  if (!placa) {
    return (
      <p className="rounded-2xl bg-fondo p-4 text-center text-sm text-slate-400">
        Guarde la moto primero. Despues podra tomarle las fotos de entrega.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl bg-fondo p-4">
        <p className="font-bold">Fotos de entrega</p>
        <p className="mt-1 text-sm text-slate-400">
          Como esta la moto al entregarla al repartidor. Sirven de respaldo si despues aparece un
          rayon o una averia.
        </p>
        <p className={`mt-2 text-sm font-bold ${listos === angulos.length ? 'text-entrada' : 'text-aviso'}`}>
          {listos === angulos.length
            ? '✓ Los 5 angulos estan tomados'
            : `Faltan ${angulos.length - listos} de ${angulos.length} angulos`}
        </p>
      </div>

      <input
        ref={archivoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = '';
          if (archivo && destino) void subir(archivo, destino, detalle);
        }}
      />

      {destino?.tipo === 'DETALLE' ? (
        <div className="rounded-2xl border border-entrada p-4">
          <p className="font-bold">{destino.etiqueta}</p>
          <p className="mt-1 text-xs text-slate-500">{destino.nota}</p>
          <input
            type="text"
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            placeholder="Que se encontro: rayon en el tanque..."
            className="mt-3 h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-lg text-slate-100 outline-none focus:border-entrada"
            autoFocus
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="boton-tactil border border-borde bg-panelClaro text-slate-300"
              onClick={() => {
                setDestino(null);
                setDetalle('');
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="boton-tactil bg-entrada text-slate-950 disabled:opacity-40"
              disabled={detalle.trim().length < 3 || trabajando !== null}
              onClick={() => archivoRef.current?.click()}
            >
              📷 Tomar foto
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-alerta/15 p-3 text-center text-sm text-alerta" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {lista.map((casilla) => {
          const ocupada = trabajando === casilla.clave;
          const esDetalle = casilla.tipo === 'DETALLE';
          return (
            <figure
              key={casilla.clave}
              className={`overflow-hidden rounded-2xl border ${
                casilla.foto ? 'border-borde bg-fondo' : 'border-dashed border-slate-600'
              }`}
            >
              {casilla.foto ? (
                <a href={`/api/evidencia/${casilla.foto.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/evidencia/${casilla.foto.id}`}
                    alt={casilla.etiqueta}
                    className="h-28 w-full object-cover"
                  />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => abrirCamara(casilla)}
                  disabled={bloqueado || trabajando !== null}
                  className="flex h-28 w-full flex-col items-center justify-center gap-1 text-slate-400 active:scale-95 disabled:opacity-40"
                >
                  <span className="text-3xl">{ocupada ? '⏳' : casilla.icono}</span>
                  <span className="text-xs">
                    {ocupada ? 'Subiendo...' : esDetalle ? 'Opcional' : 'Tomar foto'}
                  </span>
                </button>
              )}

              <figcaption className="p-2 text-xs text-slate-400">
                <span className="block font-bold text-slate-200">
                  {casilla.foto ? '✓ ' : ''}
                  {casilla.etiqueta}
                </span>
                {casilla.foto ? (
                  <>
                    <span className="block">
                      {new Date(casilla.foto.tomadaEn).toLocaleDateString('es-CR')} ·{' '}
                      {casilla.foto.cajeroNombre}
                    </span>
                    {casilla.foto.descripcion ? (
                      <span className="mt-1 block italic">{casilla.foto.descripcion}</span>
                    ) : null}
                    {confirmar === casilla.clave ? (
                      <span className="mt-2 grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => setConfirmar(null)}
                          className="rounded-lg border border-borde py-1 active:scale-95"
                        >
                          No
                        </button>
                        <button
                          type="button"
                          onClick={() => void borrar(casilla)}
                          disabled={ocupada}
                          className="rounded-lg bg-alerta py-1 font-bold text-white active:scale-95"
                        >
                          Borrar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmar(casilla.clave)}
                        disabled={bloqueado || trabajando !== null}
                        className="mt-2 w-full rounded-lg border border-borde py-1 text-alerta active:scale-95"
                      >
                        Borrar para repetir
                      </button>
                    )}
                  </>
                ) : (
                  <span className="block">{casilla.nota}</span>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>

      <p className="text-center text-xs text-slate-500">
        Borrar una foto queda anotado en la bitacora con su nombre.
      </p>
    </div>
  );
}
