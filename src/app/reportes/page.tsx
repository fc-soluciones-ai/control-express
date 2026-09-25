/**
 * El centro de reportes: una sola puerta para las preguntas del negocio.
 *
 * Antes la respuesta estaba repartida: la caja en el historial, la flota en su
 * propia pantalla, y para comparar un mes contra otro habia que poner el mismo
 * rango dos veces. Aqui se elige el rango una vez, se ven los indicadores del
 * periodo, y desde aqui se entra a cada reporte con ese rango ya puesto.
 *
 * No duplica los reportes: los enlaza. Un tercer sitio donde consultar lo
 * mismo seria un tercer sitio donde arreglar el mismo error de calculo.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Cabecera } from '@/components/Cabecera';
import { RangoDeFechas } from '@/components/RangoDeFechas';
import { formatearMoneda } from '@/lib/money/money';
import { tienePermiso } from '@/server/permisos';
import { metricasHistorial } from '@/server/services/historial';
import { contarGastosDeFlota, resumenDeFlota } from '@/server/services/mantenimiento';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

interface Parametros {
  desde?: string;
  hasta?: string;
}

function inicioDelDia(texto: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m || !m[1] || !m[2] || !m[3]) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

/** Fin exclusivo: el dia siguiente a las 00:00, para que "hasta" incluya el dia. */
function finDelDia(texto: string): Date | undefined {
  const inicio = inicioDelDia(texto);
  if (!inicio) return undefined;
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return fin;
}

export default async function Reportes({ searchParams }: { searchParams: Parametros }) {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  if (!tienePermiso(cajero.rol, 'CAJA')) redirect('/sin-permiso');

  const rango = {
    desde: searchParams.desde ? inicioDelDia(searchParams.desde) : undefined,
    hasta: searchParams.hasta ? finDelDia(searchParams.hasta) : undefined,
  };
  const verFlota = tienePermiso(cajero.rol, 'FLOTA');

  const [metricas, resumenFlota, gastosDeFlota] = await Promise.all([
    metricasHistorial(rango),
    verFlota ? resumenDeFlota(rango) : Promise.resolve([]),
    verFlota ? contarGastosDeFlota(rango) : Promise.resolve(0),
  ]);

  const gastoFlota = resumenFlota.reduce((acc, m) => acc + m.gastoTotal, 0);
  const entradaReal = metricas.abonosParciales + metricas.entregasEnCierre;

  // El rango viaja a cada reporte para no volver a escribirlo alla.
  const consulta = new URLSearchParams();
  if (searchParams.desde) consulta.set('desde', searchParams.desde);
  if (searchParams.hasta) consulta.set('hasta', searchParams.hasta);
  const cola = consulta.toString() ? `?${consulta.toString()}` : '';

  const periodo =
    searchParams.desde || searchParams.hasta
      ? `Del ${searchParams.desde ?? 'inicio'} al ${searchParams.hasta ?? 'hoy'}`
      : 'Toda la historia';

  return (
    <main className="mx-auto max-w-6xl p-5">
      <Cabecera
        migas={[{ etiqueta: 'Inicio', href: '/' }, { etiqueta: 'Reportes' }]}
        usuario={cajero}
      />

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Reportes</h1>
        <p className="text-slate-400">{periodo}</p>
      </div>

      <section className="tarjeta mb-5 p-5">
        <RangoDeFechas desde={searchParams.desde ?? ''} hasta={searchParams.hasta ?? ''} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="Entro a la caja"
          valor={formatearMoneda(entradaReal)}
          nota={`${metricas.cantidadAbonos} abonos y ${metricas.cantidadCierres} cierres`}
        />
        <Indicador
          titulo="Efectivo esperado"
          valor={formatearMoneda(metricas.efectivoEsperado)}
          nota="Lo que dice el POS"
        />
        <Indicador
          titulo="Diferencia neta"
          valor={formatearMoneda(metricas.diferenciaNeta)}
          nota={`Faltantes ${formatearMoneda(metricas.faltantes)} · sobrantes ${formatearMoneda(metricas.sobrantes)}`}
          color={metricas.diferenciaNeta < 0 ? 'alerta' : 'normal'}
        />
        {verFlota ? (
          <Indicador
            titulo="Gasto de flota"
            valor={formatearMoneda(gastoFlota)}
            nota={`${gastosDeFlota} gasto${gastosDeFlota === 1 ? '' : 's'} registrados`}
          />
        ) : (
          <Indicador
            titulo="Viajes"
            valor={metricas.viajes.toLocaleString('es-CR')}
            nota="Segun los cierres del periodo"
          />
        )}
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2">
        <Tarjeta
          href={`/historial${cola}`}
          icono="📜"
          titulo="Historial de caja"
          texto="Cada abono, cierre, arqueo y carga de Excel, con su exportacion a Excel y la vista para guardar en PDF."
        />
        {verFlota ? (
          <Tarjeta
            href={`/motos/reportes${cola}`}
            icono="🏍️"
            titulo="Reportes de flota"
            texto="Gasto por moto, costo por kilometro y el detalle de cada gasto, con buscador y paginacion."
          />
        ) : null}
      </section>
    </main>
  );
}

function Indicador({
  titulo,
  valor,
  nota,
  color = 'normal',
}: {
  titulo: string;
  valor: string;
  nota: string;
  color?: 'normal' | 'alerta';
}) {
  return (
    <div className="tarjeta p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p
        className={`cifra mt-2 text-2xl font-bold ${
          color === 'alerta' ? 'text-alerta' : 'text-slate-100'
        }`}
      >
        {valor}
      </p>
      <p className="mt-1 text-xs text-slate-500">{nota}</p>
    </div>
  );
}

function Tarjeta({
  href,
  icono,
  titulo,
  texto,
}: {
  href: string;
  icono: string;
  titulo: string;
  texto: string;
}) {
  return (
    <Link href={href} className="tarjeta block p-6 active:scale-[0.99]">
      <p className="text-3xl">{icono}</p>
      <p className="mt-3 text-xl font-bold">{titulo}</p>
      <p className="mt-1 text-sm text-slate-400">{texto}</p>
    </Link>
  );
}
