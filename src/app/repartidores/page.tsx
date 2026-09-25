/**
 * Modulo 4: pantalla de gestion de repartidores.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Cabecera } from '@/components/Cabecera';
import { BarraDeTabla } from '@/components/BarraDeTabla';
import { FiltroEnlace } from '@/components/FiltroEnlace';
import { PanelChoferes } from '@/components/PanelChoferes';
import { paraBuscar } from '@/lib/consulta';
import { listarChoferesConHistoria } from '@/server/services/choferes';
import { tienePermiso } from '@/server/permisos';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Choferes({
  searchParams,
}: {
  searchParams: { buscar?: string; estado?: string };
}) {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  // Sin el rol, la pantalla no se abre: esconder el boton no basta.
  if (!tienePermiso(cajero.rol, 'REPARTIDORES')) redirect('/sin-permiso');

  const todos = await listarChoferesConHistoria();

  const texto = paraBuscar(searchParams.buscar ?? '');
  const choferes = todos.filter((c) => {
    if (searchParams.estado && c.estado !== searchParams.estado) return false;
    if (!texto) return true;
    return paraBuscar(`${c.nombre} ${c.idMeseroSoftRestaurant} ${c.telefono ?? ''}`).includes(
      texto,
    );
  });

  const chips = searchParams.estado
    ? [
        {
          clave: 'estado',
          etiqueta: searchParams.estado === 'ACTIVO' ? 'En servicio' : 'Fuera de servicio',
        },
      ]
    : [];

  return (
    <main className="mx-auto max-w-4xl p-5">
      <Cabecera
        migas={[{ etiqueta: 'Inicio', href: '/' }, { etiqueta: 'Repartidores' }]}
        usuario={cajero}
      />
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Gestion de repartidores</h1>
          <p className="text-slate-400">
            {todos.length} repartidor{todos.length === 1 ? '' : 'es'} registrado
            {todos.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <BarraDeTabla
        buscaPor="nombre, codigo de mesero o telefono"
        chips={chips}
        resumen={
          choferes.length === todos.length
            ? undefined
            : `${choferes.length} de ${todos.length} repartidores`
        }
        filtros={
          <FiltroEnlace
            etiqueta="Estado"
            clave="estado"
            opciones={[
              { valor: '', texto: 'Todos' },
              { valor: 'ACTIVO', texto: 'En servicio' },
              { valor: 'INACTIVO', texto: 'Fuera de servicio' },
            ]}
          />
        }
      />

      <PanelChoferes choferes={choferes} esAdministrador={cajero.rol === 'ADMIN'} />
    </main>
  );
}
