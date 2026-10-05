'use client';

/**
 * El tablero de pedidos sin despachar.
 *
 * Esta pantalla vive encendida en el monitor del mostrador. De eso salen tres
 * decisiones que no son de gusto:
 *
 * 1. EL RELOJ CORRE EN EL NAVEGADOR. Si solo se repintara cuando llegan datos
 *    nuevos, un pedido se quedaria clavado en "19 min" quince segundos y
 *    saltaria a "20". Peor: el servidor podria no tener nada nuevo que mandar
 *    y el tablero se veria congelado. Los minutos se recalculan cada segundo
 *    contra la hora del SERVIDOR, no contra la del equipo del mostrador, que
 *    puede estar desfasado. De ahi el desfase que se mide en cada lectura.
 *
 * 2. SE VUELVE A LEER LA BASE, NO SE RECARGA LA PAGINA. Recargar perderia el
 *    desplazamiento y haria parpadear todo. Una accion de servidor cada quince
 *    segundos trae las filas y nada mas.
 *
 * 3. NO HAY HIDRATACION ADIVINADA. El primer pintado usa los minutos que
 *    calculo el servidor; el reloj del navegador no entra hasta que el
 *    componente esta montado. Sin eso, React se queja cada vez que el segundero
 *    cae justo en el cambio de minuto.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { accionTableroDeEntregas } from '@/app/entregas/acciones';
import {
  colorDeEspera,
  minutosDesde,
  ETIQUETA_TRAMO,
  type TramoDeEspera,
} from '@/lib/entregas/espera';
import { formatearMoneda } from '@/lib/money/money';
import type { PedidoPendiente, TableroDeEntregas as Datos } from '@/server/services/entregas';

/** Cada cuanto se vuelve a leer la base. */
const CADA_CUANTO_SE_LEE = 15_000;
/** Cada cuanto se repintan los minutos. */
const CADA_CUANTO_CORRE_EL_RELOJ = 1_000;
/** Despues de esto, lo que se ve ya no es de fiar y se dice en pantalla. */
const AGENTE_CALLADO_MINUTOS = 3;

/**
 * Hoy el POS solo usa RECIBIDO: nadie marca el empaquetado ni la asignacion.
 * Los otros dos estan por si algun dia empiezan a marcarlos.
 */
const NOMBRE_ESTADO: Record<string, string> = {
  RECIBIDO: 'Entro',
  EN_COCINA: 'En cocina',
  ASIGNADO: 'Asignado',
};

export function TableroEntregas({ inicial }: { inicial: Datos }) {
  const [datos, setDatos] = useState<Datos>(inicial);
  const [montado, setMontado] = useState(false);
  const [tic, setTic] = useState(0);
  const [falloLaLectura, setFalloLaLectura] = useState(false);

  /**
   * Cuanto adelanta o atrasa el reloj de este equipo respecto al del servidor.
   * Se vuelve a medir en cada lectura, asi que un equipo con la hora mal
   * puesta igual muestra los minutos correctos.
   */
  const desfase = useRef(Date.now() - new Date(inicial.ahora).getTime());

  const leer = useCallback(async () => {
    try {
      const frescos = await accionTableroDeEntregas();
      desfase.current = Date.now() - new Date(frescos.ahora).getTime();
      setDatos(frescos);
      setFalloLaLectura(false);
    } catch {
      // Una lectura fallida no borra la pantalla: se queda lo ultimo bueno y
      // se avisa. En el mostrador, una pantalla vacia se lee como "no hay
      // pedidos", que es exactamente la conclusion equivocada.
      setFalloLaLectura(true);
    }
  }, []);

  useEffect(() => {
    setMontado(true);
  }, []);

  useEffect(() => {
    const t = setInterval(() => void leer(), CADA_CUANTO_SE_LEE);
    return () => clearInterval(t);
  }, [leer]);

  useEffect(() => {
    const t = setInterval(() => setTic((n) => n + 1), CADA_CUANTO_CORRE_EL_RELOJ);
    return () => clearInterval(t);
  }, []);

  // El tic solo existe para forzar el repintado; el valor no se usa.
  void tic;

  const ahoraDelServidor = montado
    ? new Date(Date.now() - desfase.current)
    : new Date(datos.ahora);

  const esperas = datos.pendientes.map((p) =>
    montado ? (minutosDesde(p.entroEn, ahoraDelServidor) ?? p.minutosEsperando) : p.minutosEsperando,
  );

  const cuenta: Record<TramoDeEspera, number> = {
    VERDE: 0,
    NARANJA: 0,
    ROJO: 0,
    CRITICO: 0,
    SIN_DATO: 0,
  };
  for (const minutos of esperas) cuenta[colorDeEspera(minutos).tramo] += 1;

  const minutosSinAgente = minutosDesde(datos.ultimaSincronizacion, ahoraDelServidor);
  const agenteCallado = minutosSinAgente === null || minutosSinAgente > AGENTE_CALLADO_MINUTOS;

  return (
    <div className="space-y-5">
      {agenteCallado || falloLaLectura ? (
        <p className="rounded-2xl border border-alerta bg-alerta/15 p-4 text-center font-semibold text-alerta">
          {falloLaLectura
            ? 'No se pudo volver a leer la base. Lo que se ve es de hace un rato.'
            : minutosSinAgente === null
              ? 'Todavia no ha entrado ningun pedido del sistema de la pizzeria.'
              : `El sistema de la pizzeria no manda nada desde hace ${minutosSinAgente} minutos. Avise a quien maneja el servidor.`}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Contador
          etiqueta="Sin despachar"
          valor={datos.pendientes.length}
          clases="border-borde bg-panel text-slate-100"
        />
        <Contador
          etiqueta={`A tiempo · ${ETIQUETA_TRAMO.VERDE}`}
          valor={cuenta.VERDE}
          clases="border-entrada/40 bg-entrada/10 text-entrada"
        />
        <Contador
          etiqueta={`Apurados · ${ETIQUETA_TRAMO.NARANJA}`}
          valor={cuenta.NARANJA}
          clases="border-aviso/50 bg-aviso/15 text-aviso"
        />
        <Contador
          etiqueta={`Tarde · ${ETIQUETA_TRAMO.ROJO}`}
          valor={cuenta.ROJO}
          clases="border-alerta/70 bg-alerta/20 text-alerta"
        />
        <Contador
          etiqueta={`Criticos · ${ETIQUETA_TRAMO.CRITICO}`}
          valor={cuenta.CRITICO}
          clases="border-critico bg-critico/90 text-white"
          parpadea={cuenta.CRITICO > 0}
        />
      </section>

      {datos.pendientes.length === 0 ? (
        <section className="tarjeta p-10 text-center">
          <p className="text-2xl font-bold text-entrada">Todo despachado</p>
          <p className="mt-2 text-slate-400">
            No hay ningun pedido a domicilio esperando moto en el dia operativo{' '}
            {datos.diaOperativo}.
          </p>
        </section>
      ) : (
        <section className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {datos.pendientes.map((pedido, i) => (
            <Tarjeta key={pedido.id} pedido={pedido} minutos={esperas[i] ?? 0} />
          ))}
        </section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <p>
          Dia operativo {datos.diaOperativo} · {datos.despachadosHoy} despachado
          {datos.despachadosHoy === 1 ? '' : 's'} hoy
          {datos.recortado ? ' · lista recortada, hay mas de los que se muestran' : ''}
        </p>
        <button
          type="button"
          className="h-12 rounded-xl border border-borde bg-panelClaro px-4 text-sm font-semibold text-slate-300 active:scale-95"
          onClick={() => void leer()}
        >
          Actualizar ahora
        </button>
      </footer>
    </div>
  );
}

function Contador({
  etiqueta,
  valor,
  clases,
  parpadea = false,
}: {
  etiqueta: string;
  valor: number;
  clases: string;
  parpadea?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 text-center ${clases} ${
        parpadea ? 'animate-parpadeo' : ''
      }`}
    >
      <p className="cifra text-5xl font-bold">{valor}</p>
      <p className="mt-1 text-xs uppercase tracking-wide opacity-80">{etiqueta}</p>
    </div>
  );
}

function Tarjeta({ pedido, minutos }: { pedido: PedidoPendiente; minutos: number }) {
  const color = colorDeEspera(minutos);
  const hora = (f: Date | string) =>
    new Date(f).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <article
      className={`rounded-2xl border-2 p-4 ${color.borde} ${color.fondo} ${
        color.parpadea ? 'animate-parpadeo' : ''
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="cifra text-xl font-bold text-slate-100">#{pedido.folio}</p>
          <p className={`text-xs uppercase tracking-wide ${color.secundario}`}>
            {NOMBRE_ESTADO[pedido.estado] ?? pedido.estado} a las {hora(pedido.entroEn)} ·
            sin salir
          </p>
        </div>
        <div className="text-right">
          <p className={`cifra text-4xl font-bold leading-none ${color.texto}`}>{minutos}</p>
          <p className={`text-xs uppercase tracking-wide ${color.texto}`}>minutos</p>
        </div>
      </header>

      <p className="mt-3 truncate text-lg font-semibold text-slate-100">
        {pedido.cliente ?? 'Cliente no ligado'}
      </p>
      <p className={`mt-1 line-clamp-2 text-sm ${color.secundario}`}>
        {pedido.direccion ?? 'Sin direccion en la ficha'}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className={`text-xs uppercase tracking-wide ${color.secundario}`}>Repartidor</dt>
          <dd className="text-slate-100">
            {pedido.repartidor ?? 'sin asignar'}
            {pedido.placa ? ` · ${pedido.placa}` : ''}
          </dd>
        </div>
        <div className="text-right">
          <dt className={`text-xs uppercase tracking-wide ${color.secundario}`}>A cobrar</dt>
          <dd className="cifra text-slate-100">{formatearMoneda(pedido.total)}</dd>
        </div>
      </dl>

      {pedido.telefono ? (
        <a
          href={`tel:${pedido.telefono}`}
          className="mt-3 flex h-12 items-center justify-center rounded-xl border border-borde bg-panelClaro text-sm font-semibold text-slate-200 active:scale-95"
        >
          Llamar al {pedido.telefono}
        </a>
      ) : null}

    </article>
  );
}
