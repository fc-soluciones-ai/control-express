'use client';

/**
 * Lo que ve el repartidor en su telefono.
 *
 * Una sola columna y numeros grandes: esto se mira de pie, en la calle, con
 * una mano. Es una pantalla para consultar, no para registrar.
 *
 * Lo primero y mas grande era cuanto llevaba entregado de efectivo. Al salir
 * lo contable, lo primero es lo que trae en la mano: cuantos pedidos le faltan
 * y desde cuando los tiene. Esa es la pregunta que importa cuando el problema
 * del negocio es que los pedidos llegan tarde.
 */

import Link from 'next/link';

import { accionSalir } from '@/app/acciones';
import { minutosDesde, colorDeEspera, ETIQUETA_TRAMO } from '@/lib/entregas/espera';
import type { AlertaMoto } from '@/server/services/mantenimiento';
import type { ResumenDelRepartidor } from '@/server/services/repartidor';
import type { RepartidorEnSesion } from '@/server/services/sesion';

interface Props {
  repartidor: RepartidorEnSesion;
  resumen: ResumenDelRepartidor;
  /** Instante en que el servidor armo la pantalla, para medir la espera. */
  ahora: string;
}

const NOMBRE_CATEGORIA: Record<string, string> = {
  CAMBIO_ACEITE: 'Cambio de aceite',
  FRENOS: 'Frenos',
  LLANTAS: 'Llantas',
  RTV: 'Revision tecnica',
  SEGURO: 'Marchamo y seguro',
};

const NOMBRE_ESTADO: Record<string, string> = {
  OPERATIVA: 'Operativa',
  EN_MANTENIMIENTO: 'En el taller',
  FUERA_DE_SERVICIO: 'Fuera de servicio',
};

function textoDeAlerta(alerta: AlertaMoto): string {
  if (alerta.clase === 'KILOMETRAJE') {
    return alerta.nivel === 'VENCIDO'
      ? `vencido por ${Math.abs(alerta.kmRestantes).toLocaleString('es-CR')} km`
      : `faltan ${alerta.kmRestantes.toLocaleString('es-CR')} km`;
  }
  const fecha = alerta.vence.toLocaleDateString('es-CR');
  if (alerta.nivel === 'VENCIDO') return `vencio el ${fecha}`;
  if (alerta.diasRestantes === 0) return 'vence hoy';
  return `vence en ${alerta.diasRestantes} dia${alerta.diasRestantes === 1 ? '' : 's'}`;
}

export function PanelRepartidor({ repartidor, resumen, ahora }: Props) {
  const referencia = new Date(ahora);
  const hora = (f: Date | string) =>
    new Date(f).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <main className="mx-auto max-w-lg p-5">
      <header className="flex items-start justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-14 w-auto shrink-0" width={78} height={56} />
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest text-slate-500">Repartidor</p>
          <h1 className="text-2xl font-bold">{repartidor.nombre}</h1>
          <p className="text-sm text-slate-400">Mesero #{repartidor.codigo}</p>
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
        <p className="text-xs uppercase tracking-widest text-slate-500">Lleva en la calle</p>
        <p className="cifra mt-2 text-6xl font-bold text-slate-100">{resumen.enCamino.length}</p>
        <p className="mt-2 text-sm text-slate-400">
          {resumen.entregadosHoy} entregado{resumen.entregadosHoy === 1 ? '' : 's'} de{' '}
          {resumen.pedidosHoy} que le toco hoy
        </p>
      </section>

      {resumen.enCamino.length > 0 ? (
        <section className="tarjeta mt-4 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sus pedidos pendientes</p>
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
                    <p className={`mt-1 text-xs ${color.secundario}`}>
                      Salio a las {hora(pedido.salioEn)}
                    </p>
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
      ) : (
        <section className="tarjeta mt-4 p-5 text-center text-slate-400">
          No tiene pedidos pendientes ahora mismo.
        </section>
      )}

      <Link
        href="/mi/gasolina"
        className="boton-tactil mt-4 flex w-full items-center justify-center bg-entrada text-lg text-slate-950"
      >
        ⛽ Cargar gasolina
      </Link>

      {resumen.moto ? (
        <section className="tarjeta mt-4 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-500">Su moto</p>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <span className="cifra text-2xl font-bold">{resumen.moto.placa}</span>
            <span className="text-sm text-slate-400">
              {resumen.moto.marca} {resumen.moto.modelo}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-fondo p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Kilometraje</p>
              <p className="cifra mt-1 font-bold">
                {resumen.moto.kilometraje.toLocaleString('es-CR')} km
              </p>
            </div>
            <div className="rounded-2xl bg-fondo p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
              <p className="mt-1 font-bold">
                {NOMBRE_ESTADO[resumen.moto.estado] ?? resumen.moto.estado}
              </p>
            </div>
          </div>
          {resumen.moto.prestada ? (
            <p className="mt-3 rounded-2xl bg-aviso/15 p-3 text-sm text-aviso">
              Es la moto comodin, prestada mientras la suya esta en el taller.
            </p>
          ) : null}
          {resumen.moto.alertas.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {resumen.moto.alertas.map((alerta) => (
                <li
                  key={`${alerta.clase}-${alerta.categoria}`}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    alerta.nivel === 'VENCIDO'
                      ? 'bg-alerta/15 text-alerta'
                      : 'bg-aviso/15 text-aviso'
                  }`}
                >
                  {NOMBRE_CATEGORIA[alerta.categoria] ?? alerta.categoria}: {textoDeAlerta(alerta)}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <section className="tarjeta mt-4 p-5 text-center text-slate-400">
          Hoy no tiene ninguna moto asignada.
        </section>
      )}

      <p className="mt-6 text-center text-xs text-slate-600">
        Dia operativo {resumen.diaOperativo}. Los pedidos salen del sistema de la pizzeria.
      </p>
    </main>
  );
}
