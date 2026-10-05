'use client';

/**
 * La franja de flota que va arriba del tablero.
 *
 * Antes lo que mandaba aqui era el total de efectivo en caja. Al quitarse todo
 * lo contable, lo que se mira de reojo cada rato es cuantas motos pueden
 * salir: esa es la cifra que decide si hay reparto esta noche.
 *
 * Los accesos a las pantallas salieron de este componente. Estaban repetidos:
 * la cabecera ya pinta las pestanas de cada modulo leyendo la misma lista, y
 * dos filas de botones a lo mismo hacen dudar de si llevan al mismo lado.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface Props {
  motosOperativas: number;
  motosEnTaller: number;
  motosFueraDeServicio: number;
  /** Operativas sin nadie asignado: estan libres. */
  motosSinChofer: number;
  /** Mantenimientos o vencimientos que piden atencion. */
  alertas: number;
}

/**
 * Cada cuanto se refresca lo de la flota si nadie toca la pantalla.
 *
 * Dos minutos, no quince segundos: una moto entra al taller dos o tres veces
 * por semana, no dos veces por minuto. Los pedidos se refrescan aparte y mucho
 * mas seguido, porque esos si cambian todo el tiempo.
 */
const REFRESCO_MS = 120_000;

export function BarraSuperior({
  motosOperativas,
  motosEnTaller,
  motosFueraDeServicio,
  motosSinChofer,
  alertas,
}: Props) {
  const router = useRouter();

  // Una moto puede entrar al taller desde otra pantalla. Sin este refresco, la
  // franja se quedaria toda la noche diciendo que puede salir.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), REFRESCO_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <header className="tarjeta mb-5 p-5">
      <div className="flex flex-wrap items-end gap-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">Motos que pueden salir</p>
          <p className="cifra mt-1 text-cifraGrande text-entrada">{motosOperativas}</p>
          <p className="mt-2 text-sm text-slate-400">{motosSinChofer} sin repartidor asignado</p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <span className="text-slate-500">En el taller</span>
          <span className="cifra font-bold text-aviso">{motosEnTaller}</span>
          <span className="text-slate-500">Fuera de servicio</span>
          <span className="cifra font-bold text-slate-400">{motosFueraDeServicio}</span>
        </div>
      </div>

      {alertas > 0 ? (
        <p className="mt-4 rounded-2xl bg-aviso/15 p-4 text-aviso">
          ⚠ {alertas} aviso{alertas === 1 ? '' : 's'} de mantenimiento por atender: aceite, RTV o
          seguro. Vea la flota.
        </p>
      ) : null}
    </header>
  );
}
