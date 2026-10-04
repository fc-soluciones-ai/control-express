'use client';

/**
 * Las pestanas de la aplicacion madre: Express, Clientes, Entregas.
 *
 * Va en la cabecera, asi que esta en todas las pantallas. Se elige el modulo
 * una vez y lo de abajo cambia; sin esto, las pantallas de clientes y las de
 * la caja quedarian revueltas en la misma lista de botones y nadie sabria
 * cual pertenece a que.
 *
 * El modulo activo sale de la direccion y no de un estado: al recargar, al
 * compartir un enlace o al apretar Atras, la pestana que se ve pintada es la
 * del lugar donde uno esta de verdad.
 *
 * Una pestana sin ninguna pantalla que el usuario pueda abrir no se pinta: un
 * cajero no tiene nada que hacer en Clientes, y ofrecerle la pestana es
 * prometerle algo que la pantalla de destino le va a negar.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { MODULOS, moduloDeLaRuta } from '@/server/config/modulos';
import { tienePermiso } from '@/server/permisos';

export function PestanasDeModulo({ rol }: { rol: string }) {
  const ruta = usePathname() ?? '/';
  const activo = moduloDeLaRuta(ruta).clave;

  const visibles = MODULOS.filter(
    (m) =>
      // El que esta en construccion se muestra igual: saber que viene es
      // parte de entender la aplicacion, y evita la pregunta de todos los
      // dias sobre donde quedo lo de las entregas.
      m.enConstruccion || m.pantallas.some((p) => tienePermiso(rol, p.permiso)),
  );
  if (visibles.length < 2) return null;

  return (
    <nav aria-label="Modulos" className="mx-auto mt-3 max-w-[1600px]">
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {visibles.map((modulo) => {
          const puesto = modulo.clave === activo;
          const apagado = modulo.enConstruccion;

          if (apagado) {
            return (
              <li key={modulo.clave}>
                <span
                  title="Todavia no esta hecho."
                  className="flex h-11 cursor-default items-center gap-2 whitespace-nowrap rounded-2xl border border-dashed border-borde px-4 text-sm text-slate-600"
                >
                  <span aria-hidden>{modulo.icono}</span>
                  {modulo.nombre}
                  <span className="rounded-full bg-borde px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    pronto
                  </span>
                </span>
              </li>
            );
          }

          return (
            <li key={modulo.clave}>
              <Link
                href={modulo.inicio}
                aria-current={puesto ? 'page' : undefined}
                className={`flex h-11 items-center gap-2 whitespace-nowrap rounded-2xl px-4 text-sm font-semibold active:scale-95 ${
                  puesto
                    ? 'bg-entrada text-slate-950'
                    : 'border border-borde bg-panelClaro text-slate-300'
                }`}
              >
                <span aria-hidden>{modulo.icono}</span>
                {modulo.nombre}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
