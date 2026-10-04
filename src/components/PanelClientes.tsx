'use client';

/**
 * Clientes y el proyecto de ubicaciones, en una sola pantalla.
 *
 * El orden de arriba a abajo es el orden del trabajo de un dia:
 *
 *   1. Como va el proyecto (cuantos faltan, cuantos contestaron).
 *   2. Sacar la tanda de hoy y marcarla como enviada cuando se mando.
 *   3. Revisar los puntos que llegaron: aceptar o rechazar.
 *   4. Buscar un cliente concreto cuando llama por telefono.
 *
 * El paso 3 es el que no se puede saltar. Un punto que llega es una PROPUESTA:
 * el cliente pudo haber mandado la ubicacion del trabajo, o la del
 * supermercado donde estaba cuando leyo el mensaje.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { BarraDeTabla, type ChipActivo } from '@/components/BarraDeTabla';
import { FiltroEnlace } from '@/components/FiltroEnlace';
import { Paginacion } from '@/components/Paginacion';
import { conParametros } from '@/lib/consulta';
import { telefonoBonito } from '@/lib/clientes/normalizar';

import {
  accionAceptarUbicacion,
  accionArmarTanda,
  accionDescargarTanda,
  accionMarcarEnviada,
  accionRechazarUbicacion,
} from '@/app/clientes/acciones';

/** Como se dice cada estado en la pantalla, y de que color. */
const ESTADOS: Record<string, { texto: string; clase: string; ayuda: string }> = {
  LISTO: {
    texto: 'Listo',
    clase: 'bg-entrada/20 text-entrada',
    ayuda: 'Celular propio, nombre y direccion. Se le puede escribir hoy.',
  },
  SIN_TELEFONO: {
    texto: 'Sin telefono',
    clase: 'bg-alerta/20 text-alerta',
    ayuda: 'No hay ningun numero que sirva. Hay que pedirselo en el proximo pedido.',
  },
  TELEFONO_POR_CONFIRMAR: {
    texto: 'Telefono por confirmar',
    clase: 'bg-amber-500/20 text-amber-300',
    ayuda:
      'El numero se reconstruyo del formato viejo de siete digitos o se saco de un texto. ' +
      'Puede ser de otra casa: hay que confirmarlo antes de escribirle.',
  },
  TELEFONO_COMPARTIDO: {
    texto: 'Telefono compartido',
    clase: 'bg-amber-500/20 text-amber-300',
    ayuda:
      'Otro cliente tiene el mismo numero. Escribirle le llega varias veces a la misma persona.',
  },
  SOLO_FIJO: {
    texto: 'Solo fijo',
    clase: 'bg-slate-600/40 text-slate-300',
    ayuda: 'A un numero fijo no le llega WhatsApp. Hay que llamarlo.',
  },
  DIRECCION_POBRE: {
    texto: 'Direccion pobre',
    clase: 'bg-amber-500/20 text-amber-300',
    ayuda: 'Tiene celular, pero la direccion escrita no sirve para salir a repartir.',
  },
  SIN_NOMBRE: {
    texto: 'Sin nombre',
    clase: 'bg-alerta/20 text-alerta',
    ayuda: 'La ficha no tiene nombre. No se le puede escribir sin saber a quien.',
  },
};

const CALIDAD: Record<string, string> = {
  VACIA: 'vacia',
  SOLO_LUGAR: 'solo un lugar',
  POBRE: 'pobre',
  PASABLE: 'pasable',
  DETALLADA: 'detallada',
};

interface Fila {
  clave: string;
  nombre: string;
  telefono: string | null;
  esCelular: boolean;
  direccionTexto: string;
  calidadDireccion: string;
  estado: string;
  telefonoCompartido: boolean;
  nombreRepetido: boolean;
  cuantasUbicaciones: number;
  ultimaSolicitud: { estado: string; tanda: number } | null;
}

interface PorRevisar {
  id: string;
  clave: string;
  nombre: string;
  direccionTexto: string;
  latitud: number;
  longitud: number;
  precisionMetros: number | null;
  nota: string | null;
  origen: string;
  creadaEn: string;
}

interface Avance {
  clientes: number;
  listos: number;
  solicitudes: Record<string, number>;
  ubicacionesPropuestas: number;
  ubicacionesAceptadas: number;
  ultimaTanda: number;
  tandaSinEnviar: number | null;
  porcentajeRespuesta: number;
}

interface Props {
  avance: Avance;
  estados: Array<{ estado: string; cuantos: number }>;
  total: number;
  pagina: number;
  tamano: number;
  filas: Fila[];
  porRevisar: PorRevisar[];
}

export function PanelClientes({
  avance,
  estados,
  total,
  pagina,
  tamano,
  filas,
  porRevisar,
}: Props) {
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [cuantas, setCuantas] = useState(150);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** El archivo llega en base64 y se arma aqui, sin tocar el disco del servidor. */
  const bajar = useCallback((nombreArchivo: string, base64: string) => {
    const binario = atob(base64);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    const url = URL.createObjectURL(
      new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(url);
  }, []);

  const armar = useCallback(async () => {
    setTrabajando(true);
    setError(null);
    setAviso(null);
    const r = await accionArmarTanda(cuantas);
    setTrabajando(false);
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    bajar(r.datos.nombreArchivo, r.datos.base64);
    setAviso(
      `Tanda ${r.datos.tanda} armada con ${r.datos.cuantas} mensajes. ` +
        'Mandelos desde el Excel y despues marque la tanda como enviada.',
    );
  }, [bajar, cuantas]);

  const descargar = useCallback(
    async (tanda: number) => {
      setError(null);
      const r = await accionDescargarTanda(tanda);
      if (!r.ok) setError(r.mensaje);
      else bajar(r.datos.nombreArchivo, r.datos.base64);
    },
    [bajar],
  );

  const marcarEnviada = useCallback(async (tanda: number) => {
    setTrabajando(true);
    setError(null);
    const r = await accionMarcarEnviada(tanda);
    setTrabajando(false);
    if (!r.ok) setError(r.mensaje);
    else setAviso(`Tanda ${tanda} marcada como enviada: ${r.datos} mensajes.`);
  }, []);

  const aceptar = useCallback(async (id: string) => {
    setError(null);
    const r = await accionAceptarUbicacion(id);
    if (!r.ok) setError(r.mensaje);
  }, []);

  const rechazar = useCallback(async (id: string) => {
    const motivo = window.prompt(
      'Por que no sirve esta ubicacion?\n\nEjemplo: "es la del trabajo", "cayo en otro canton".',
    );
    if (motivo === null) return;
    setError(null);
    const r = await accionRechazarUbicacion(id, motivo);
    if (!r.ok) setError(r.mensaje);
  }, []);

  const chips: ChipActivo[] = [];
  const estadoPuesto = parametros.get('estado');
  if (estadoPuesto) {
    chips.push({ clave: 'estado', etiqueta: ESTADOS[estadoPuesto]?.texto ?? estadoPuesto });
  }
  if (parametros.get('conUbicacion') === 'SI') {
    chips.push({ clave: 'conUbicacion', etiqueta: 'Ya mandaron ubicacion' });
  }
  if (parametros.get('conUbicacion') === 'NO') {
    chips.push({ clave: 'conUbicacion', etiqueta: 'Sin ubicacion' });
  }
  if (parametros.get('repetidos') === 'SI') chips.push({ clave: 'repetidos', etiqueta: 'Repetidos' });

  const sinEnviar = avance.tandaSinEnviar;
  const faltanPorPedir = avance.listos - (avance.solicitudes.RESPONDIDA ?? 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-4">
      {/* --- 1. Como va el proyecto ---------------------------------------- */}
      <section className="tarjeta p-5">
        <h1 className="text-xl font-bold">Ubicaciones de clientes</h1>
        <p className="mt-1 text-sm text-slate-400">
          Pedirle a cada cliente su punto en el mapa, para que el repartidor no tenga que llamar.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato numero={avance.clientes} texto="clientes en la base" />
          <Dato numero={avance.listos} texto="listos para escribirles" resaltado />
          <Dato numero={avance.ubicacionesAceptadas} texto="ubicaciones buenas" />
          <Dato
            numero={avance.porcentajeRespuesta}
            sufijo="%"
            texto="contestaron de los que recibieron"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {estados.map((e) => {
            const estilo = ESTADOS[e.estado];
            return (
              <Link
                key={e.estado}
                href={conParametros(ruta, parametros, {
                  estado: estadoPuesto === e.estado ? null : e.estado,
                })}
                scroll={false}
                title={estilo?.ayuda}
                className={`rounded-full px-3 py-1 ${estilo?.clase ?? 'bg-slate-700 text-slate-300'} ${
                  estadoPuesto === e.estado ? 'ring-2 ring-slate-100' : ''
                }`}
              >
                {estilo?.texto ?? e.estado} · {e.cuantos}
              </Link>
            );
          })}
        </div>
      </section>

      {/* --- 2. La tanda de hoy -------------------------------------------- */}
      <section className="tarjeta mt-4 p-5">
        <h2 className="font-bold">Mandar los mensajes</h2>
        <p className="mt-1 text-sm text-slate-400">
          El sistema no manda los mensajes: arma la lista con el texto y el enlace de cada
          cliente, y los manda una persona desde WhatsApp. Mandar miles de mensajes de golpe
          hace que Meta bloquee el numero de la pizzeria, y eso se lleva tambien los pedidos.
        </p>

        {sinEnviar !== null && (
          <div className="mt-4 rounded-2xl bg-amber-500/15 p-4">
            <p className="text-sm">
              La tanda <strong>{sinEnviar}</strong> esta armada y todavia no se marco como
              enviada.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => descargar(sinEnviar)}
                className="boton-tactil border border-borde bg-panelClaro px-4 text-sm text-slate-200"
              >
                Bajar la lista otra vez
              </button>
              <button
                type="button"
                onClick={() => marcarEnviada(sinEnviar)}
                disabled={trabajando}
                className="boton-tactil bg-entrada px-4 text-sm text-slate-950 disabled:opacity-50"
              >
                Ya los mande
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-slate-400">Cuantos en esta tanda</span>
            <input
              type="number"
              min={1}
              max={500}
              value={cuantas}
              onChange={(e) => setCuantas(Number(e.target.value))}
              className="mt-1 block h-12 w-28 rounded-2xl border border-borde bg-panelClaro px-3 text-lg text-slate-100 outline-none focus:border-entrada"
            />
          </label>
          <button
            type="button"
            onClick={armar}
            disabled={trabajando || sinEnviar !== null}
            className="boton-tactil bg-entrada px-6 text-slate-950 disabled:opacity-40"
          >
            {trabajando ? 'Armando...' : 'Armar la siguiente tanda'}
          </button>
          <p className="text-xs text-slate-500">
            {sinEnviar !== null
              ? 'Primero marque la tanda anterior como enviada.'
              : `Faltan ${Math.max(0, faltanPorPedir)} clientes listos por pedirles la ubicacion.`}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-5">
          <EstadoSolicitud texto="Sin mandar" numero={avance.solicitudes.PENDIENTE ?? 0} />
          <EstadoSolicitud texto="Mandadas" numero={avance.solicitudes.ENVIADA ?? 0} />
          <EstadoSolicitud texto="Abrieron el enlace" numero={avance.solicitudes.ABIERTA ?? 0} />
          <EstadoSolicitud texto="Contestaron" numero={avance.solicitudes.RESPONDIDA ?? 0} />
          <EstadoSolicitud texto="Dijeron que no" numero={avance.solicitudes.RECHAZADA ?? 0} />
        </div>

        {aviso && <p className="mt-4 rounded-2xl bg-entrada/15 p-3 text-sm text-entrada">{aviso}</p>}
        {error && <p className="mt-4 rounded-2xl bg-alerta/15 p-3 text-sm text-alerta">{error}</p>}
      </section>

      {/* --- 3. Revisar lo que llego --------------------------------------- */}
      {porRevisar.length > 0 && (
        <section className="tarjeta mt-4 p-5">
          <h2 className="font-bold">
            Ubicaciones por revisar{' '}
            <span className="rounded-full bg-entrada/20 px-2 py-0.5 text-sm text-entrada">
              {avance.ubicacionesPropuestas}
            </span>
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Un punto no reemplaza la direccion hasta que alguien lo acepte: el cliente pudo
            mandar la del trabajo.
          </p>

          <div className="mt-4 grid gap-3">
            {porRevisar.map((u) => (
              <div key={u.id} className="rounded-2xl border border-borde bg-panelClaro p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{u.nombre}</p>
                    <p className="text-xs text-slate-500">Clave {u.clave}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {u.precisionMetros == null
                      ? 'precision desconocida'
                      : `±${Math.round(u.precisionMetros)} m`}
                  </span>
                </div>

                <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
                  Direccion escrita
                </p>
                <p className="text-sm text-slate-300">{u.direccionTexto || '(vacia)'}</p>

                {u.nota && (
                  <>
                    <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
                      Lo que escribio el cliente
                    </p>
                    <p className="text-sm text-slate-200">{u.nota}</p>
                  </>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${u.latitud}&mlon=${u.longitud}#map=18/${u.latitud}/${u.longitud}`}
                    target="_blank"
                    rel="noreferrer"
                    className="boton-tactil border border-borde px-4 text-sm text-slate-200"
                  >
                    Ver en el mapa
                  </a>
                  <button
                    type="button"
                    onClick={() => aceptar(u.id)}
                    className="boton-tactil bg-entrada px-4 text-sm text-slate-950"
                  >
                    Aceptar
                  </button>
                  <button
                    type="button"
                    onClick={() => rechazar(u.id)}
                    className="boton-tactil border border-borde px-4 text-sm text-alerta"
                  >
                    No sirve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- 4. Buscar un cliente ------------------------------------------ */}
      <section className="tarjeta mt-4 p-5">
        <h2 className="font-bold">La base de clientes</h2>
        <div className="mt-3">
          <BarraDeTabla
            buscaPor="nombre, clave, telefono o direccion"
            chips={chips}
            resumen={`${total} clientes`}
            filtros={
              <div className="grid gap-4 sm:grid-cols-2">
                <FiltroEnlace
                  etiqueta="Ubicacion"
                  clave="conUbicacion"
                  opciones={[
                    { valor: '', texto: 'Todos' },
                    { valor: 'SI', texto: 'Ya la mandaron' },
                    { valor: 'NO', texto: 'Falta' },
                  ]}
                />
                <FiltroEnlace
                  etiqueta="Repetidos"
                  clave="repetidos"
                  opciones={[
                    { valor: '', texto: 'Todos' },
                    { valor: 'SI', texto: 'Solo los marcados' },
                  ]}
                />
              </div>
            }
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Telefono</th>
                <th className="py-2 pr-3">Direccion</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2">Ubicacion</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => {
                const estilo = ESTADOS[c.estado];
                return (
                  <tr key={c.clave} className="border-t border-borde align-top">
                    <td className="py-3 pr-3">
                      <p className="font-semibold">{c.nombre || '(sin nombre)'}</p>
                      <p className="text-xs text-slate-500">
                        {c.clave}
                        {c.nombreRepetido && ' · nombre repetido'}
                      </p>
                    </td>
                    <td className="cifra py-3 pr-3 whitespace-nowrap">
                      {c.telefono ? telefonoBonito(c.telefono) : '—'}
                      {c.telefono && !c.esCelular && (
                        <span className="block text-xs text-slate-500">fijo</span>
                      )}
                      {c.telefonoCompartido && (
                        <span className="block text-xs text-amber-300">compartido</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <p className="max-w-sm text-slate-300">{c.direccionTexto || '(vacia)'}</p>
                      <p className="text-xs text-slate-500">{CALIDAD[c.calidadDireccion]}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        title={estilo?.ayuda}
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          estilo?.clase ?? 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {estilo?.texto ?? c.estado}
                      </span>
                    </td>
                    <td className="py-3 text-xs">
                      {c.cuantasUbicaciones > 0 ? (
                        <span className="text-entrada">
                          {c.cuantasUbicaciones} punto{c.cuantasUbicaciones > 1 ? 's' : ''}
                        </span>
                      ) : c.ultimaSolicitud ? (
                        <span className="text-slate-400">
                          tanda {c.ultimaSolicitud.tanda} · {c.ultimaSolicitud.estado.toLowerCase()}
                        </span>
                      ) : (
                        <span className="text-slate-600">sin pedir</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-500">
                    Ningun cliente con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Paginacion total={total} pagina={pagina} tamano={tamano} nombre="clientes" />
      </section>
    </main>
  );
}

function Dato({
  numero,
  texto,
  sufijo = '',
  resaltado = false,
}: {
  numero: number;
  texto: string;
  sufijo?: string;
  resaltado?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 ${resaltado ? 'bg-entrada/15' : 'bg-fondo'}`}>
      <p className={`cifra text-2xl font-bold ${resaltado ? 'text-entrada' : ''}`}>
        {numero.toLocaleString('es-CR')}
        {sufijo}
      </p>
      <p className="mt-1 text-xs text-slate-400">{texto}</p>
    </div>
  );
}

function EstadoSolicitud({ texto, numero }: { texto: string; numero: number }) {
  return (
    <div className="rounded-xl bg-fondo p-3">
      <p className="cifra text-lg font-bold text-slate-200">{numero}</p>
      <p className="text-xs text-slate-500">{texto}</p>
    </div>
  );
}
