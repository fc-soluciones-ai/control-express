'use client';

/**
 * Historial y auditoria.
 *
 * Los filtros viven en la URL, no en el estado del componente. Asi se puede
 * dejar la pantalla abierta en "Tono, ultimos 4 dias" y recargar sin perderla,
 * y el supervisor puede pasarle el enlace exacto a otro.
 *
 * Antes esta pantalla abria con ocho metricas de dinero y dos botones de
 * exportar. Ya no hay cierres que sumar ni archivos que generar: lo que queda
 * es la lista de hechos, que es para lo que se consulta de verdad.
 */

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { formatearFechaHora } from '@/lib/fechas';
import { esClaveDeDinero, formatearMoneda } from '@/lib/money/money';
import type { FilaHistorial } from '@/server/services/historial';

interface Props {
  filas: FilaHistorial[];
  hayMas: boolean;
  opciones: {
    choferes: Array<{ id: string; nombre: string }>;
    cajeros: Array<{ id: string; nombre: string }>;
  };
  filtrosActuales: {
    desde: string;
    hasta: string;
    choferId: string;
    cajeroId: string;
    tipo: string;
  };
  descripcionFiltro: string;
}

const NOMBRE_EVENTO: Record<string, string> = {
  CHOFER_CREADO: 'Alta de repartidor',
  CHOFER_EDITADO: 'Edicion de repartidor',
  CHOFER_DESACTIVADO: 'Baja de repartidor',
  MOTO_CREADA: 'Alta de moto',
  MOTO_EDITADA: 'Edicion de moto',
  MOTO_ESTADO: 'Cambio de estado de moto',
  MOTO_ASIGNADA: 'Moto asignada',
  MOTO_LIBERADA: 'Moto liberada',
  MANTENIMIENTO: 'Gasto o mantenimiento',
  EVIDENCIA: 'Evidencia',
  LOGIN: 'Entrada al sistema',
  LOGIN_FALLIDO: 'Entrada fallida',
  CAJERO_BLOQUEADO: 'Usuario bloqueado',
  PIN_CAMBIADO: 'Cambio de PIN',
  USUARIO_CREADO: 'Alta de usuario',
  USUARIO_EDITADO: 'Cambio de usuario',
  RESPALDO: 'Respaldo',
  CLIENTES_IMPORTADOS: 'Clientes del POS',
  SOLICITUDES_GENERADAS: 'Tanda de WhatsApp armada',
  SOLICITUDES_MARCADAS_ENVIADAS: 'Tanda marcada como enviada',
  UBICACION_RECIBIDA: 'Ubicacion recibida',
  UBICACION_ACEPTADA: 'Ubicacion aceptada',
  UBICACION_RECHAZADA: 'Ubicacion rechazada',
};

const COLOR_EVENTO: Record<string, string> = {
  MANTENIMIENTO: 'bg-amber-500/15 text-aviso',
  MOTO_ESTADO: 'bg-alerta/15 text-alerta',
  MOTO_ASIGNADA: 'bg-sky-500/15 text-sky-300',
  MOTO_LIBERADA: 'bg-sky-500/15 text-sky-300',
  UBICACION_ACEPTADA: 'bg-entrada/15 text-entrada',
  UBICACION_RECHAZADA: 'bg-alerta/15 text-alerta',
  LOGIN_FALLIDO: 'bg-alerta/15 text-alerta',
};

/** Los eventos que alguien busca a diario. */
const TIPOS_FILTRABLES = [
  { valor: '', texto: 'Todos los eventos' },
  { valor: 'MANTENIMIENTO', texto: 'Gastos y mantenimiento' },
  { valor: 'MOTO_ESTADO', texto: 'Cambios de estado de moto' },
  { valor: 'MOTO_ASIGNADA', texto: 'Asignaciones de moto' },
  { valor: 'UBICACION_ACEPTADA', texto: 'Ubicaciones aceptadas' },
  { valor: 'SOLICITUDES_GENERADAS', texto: 'Tandas de WhatsApp' },
  { valor: 'LOGIN', texto: 'Entradas al sistema' },
];

export function PanelHistorial({
  filas,
  hayMas,
  opciones,
  filtrosActuales,
  descripcionFiltro,
}: Props) {
  const router = useRouter();
  const rutaActual = usePathname();
  const parametros = useSearchParams();
  const [pendiente, iniciarTransicion] = useTransition();

  const [detalle, setDetalle] = useState<FilaHistorial | null>(null);

  const cambiarFiltro = useCallback(
    (clave: string, valor: string) => {
      const nuevos = new URLSearchParams(parametros.toString());
      if (valor === '') nuevos.delete(clave);
      else nuevos.set(clave, valor);
      iniciarTransicion(() => router.replace(`${rutaActual}?${nuevos.toString()}`));
    },
    [parametros, rutaActual, router],
  );

  const atajoDias = useCallback(
    (dias: number) => {
      const desde = new Date();
      desde.setDate(desde.getDate() - dias);
      const nuevos = new URLSearchParams(parametros.toString());
      nuevos.set('desde', desde.toISOString().slice(0, 10));
      nuevos.delete('hasta');
      iniciarTransicion(() => router.replace(`${rutaActual}?${nuevos.toString()}`));
    },
    [parametros, rutaActual, router],
  );

  return (
    <div className="space-y-5">
      <section className="tarjeta p-5 print:hidden">
        <div className="grid gap-4 lg:grid-cols-4">
          <CampoFiltro etiqueta="Desde">
            <input
              type="date"
              value={filtrosActuales.desde}
              onChange={(e) => cambiarFiltro('desde', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            />
          </CampoFiltro>

          <CampoFiltro etiqueta="Hasta">
            <input
              type="date"
              value={filtrosActuales.hasta}
              onChange={(e) => cambiarFiltro('hasta', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            />
          </CampoFiltro>

          <CampoFiltro etiqueta="Repartidor">
            <select
              value={filtrosActuales.choferId}
              onChange={(e) => cambiarFiltro('repartidor', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            >
              <option value="">Todos</option>
              {opciones.choferes.map((chofer) => (
                <option key={chofer.id} value={chofer.id}>
                  {chofer.nombre}
                </option>
              ))}
            </select>
          </CampoFiltro>

          <CampoFiltro etiqueta="Tipo de evento">
            <select
              value={filtrosActuales.tipo}
              onChange={(e) => cambiarFiltro('tipo', e.target.value)}
              className="h-tactil w-full rounded-2xl border border-borde bg-panelClaro px-4 text-slate-100"
            >
              {TIPOS_FILTRABLES.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {tipo.texto}
                </option>
              ))}
            </select>
          </CampoFiltro>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { texto: 'Hoy', dias: 0 },
            { texto: 'Ultimos 4 dias', dias: 4 },
            { texto: 'Ultimos 7 dias', dias: 7 },
            { texto: 'Ultimos 30 dias', dias: 30 },
          ].map((atajo) => (
            <button
              key={atajo.texto}
              type="button"
              className="h-12 rounded-xl border border-borde bg-panelClaro px-4 text-sm font-semibold text-slate-300 active:scale-95"
              onClick={() => atajoDias(atajo.dias)}
            >
              {atajo.texto}
            </button>
          ))}
          <Link
            href="/historial"
            className="flex h-12 items-center rounded-xl border border-borde px-4 text-sm text-slate-400"
          >
            Limpiar filtros
          </Link>
        </div>
      </section>

      <section className="tarjeta p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Movimientos</h2>
          <div className="text-right text-sm text-slate-400">
            <p>{descripcionFiltro}</p>
            <p>
              {pendiente
                ? 'Actualizando...'
                : `${filas.length} registro${filas.length === 1 ? '' : 's'}`}
              {hayMas ? ' (se muestran los mas recientes)' : ''}
            </p>
          </div>
        </div>

        {filas.length === 0 ? (
          <p className="mt-8 text-center text-slate-500">
            No hay movimientos que coincidan con el filtro.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Fecha y hora</th>
                  <th className="pb-2">Evento</th>
                  <th className="pb-2">Repartidor</th>
                  <th className="pb-2">Usuario</th>
                  <th className="pb-2 text-right">Monto</th>
                  <th className="pb-2 print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {filas.map((fila) => (
                  <tr key={fila.id}>
                    <td className="cifra whitespace-nowrap py-3 text-slate-300">
                      {formatearFechaHora(new Date(fila.timestamp))}
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                          COLOR_EVENTO[fila.tipo] ?? 'bg-panelClaro text-slate-300'
                        }`}
                      >
                        {NOMBRE_EVENTO[fila.tipo] ?? fila.tipo}
                      </span>
                    </td>
                    <td className="py-3">{fila.choferNombre ?? 'sin repartidor'}</td>
                    <td className="py-3 text-slate-400">{fila.cajeroNombre ?? 'sin usuario'}</td>
                    <td className="cifra py-3 text-right font-bold">
                      {fila.monto === null ? '' : formatearMoneda(fila.monto)}
                    </td>
                    <td className="py-3 text-right print:hidden">
                      <button
                        type="button"
                        className="h-12 rounded-xl border border-borde px-4 text-sm text-slate-300 active:scale-95"
                        onClick={() => setDetalle(fila)}
                      >
                        Ver ficha
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detalle ? <FichaDetalle fila={detalle} alCerrar={() => setDetalle(null)} /> : null}
    </div>
  );
}

function CampoFiltro({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function FichaDetalle({ fila, alCerrar }: { fila: FilaHistorial; alCerrar: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="tarjeta w-full max-w-2xl p-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wide text-slate-400">Ficha del movimiento</p>
            <h2 className="text-2xl font-bold">{NOMBRE_EVENTO[fila.tipo] ?? fila.tipo}</h2>
            <p className="cifra mt-1 text-slate-400">
              {formatearFechaHora(new Date(fila.timestamp))}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="h-12 w-12 shrink-0 rounded-full border border-borde text-2xl text-slate-400 active:scale-95"
            onClick={alCerrar}
          >
            x
          </button>
        </header>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Dato etiqueta="Repartidor" valor={fila.choferNombre ?? 'sin repartidor'} />
          <Dato etiqueta="Usuario" valor={fila.cajeroNombre ?? 'sin usuario'} />
          <Dato
            etiqueta="Monto"
            valor={fila.monto === null ? 'sin monto' : formatearMoneda(fila.monto)}
          />
          <Dato etiqueta="Dispositivo" valor={fila.dispositivo ?? 'sin dato'} />
          <Dato etiqueta="Entidad" valor={fila.entidadTipo ?? 'sin dato'} />
          <Dato etiqueta="Referencia" valor={fila.entidadId ?? 'sin dato'} />
        </dl>

        {fila.detalle ? (
          <div className="mt-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Detalle registrado</p>
            <dl className="mt-2 divide-y divide-borde rounded-2xl border border-borde bg-fondo">
              {Object.entries(fila.detalle).map(([clave, valor]) => (
                <div key={clave} className="flex justify-between gap-4 px-4 py-2">
                  <dt className="text-slate-400">{clave}</dt>
                  <dd className="cifra text-right text-slate-200">
                    {formatearValorDeDetalle(clave, valor)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Los montos de la bitacora vienen en centimos. Ver esClaveDeDinero. */
function formatearValorDeDetalle(clave: string, valor: unknown): string {
  if (typeof valor === 'number' && esClaveDeDinero(clave)) {
    return formatearMoneda(valor);
  }
  if (typeof valor === 'object' && valor !== null) {
    return Array.isArray(valor) ? `${valor.length} elemento(s)` : JSON.stringify(valor);
  }
  return String(valor);
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-borde bg-fondo p-3">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{etiqueta}</dt>
      <dd className="mt-1 break-words text-slate-100">{valor}</dd>
    </div>
  );
}
