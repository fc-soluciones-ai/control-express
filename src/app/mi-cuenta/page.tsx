/**
 * Mi cuenta: quien soy, que me permite mi rol y mi PIN.
 *
 * Cualquier usuario de caja entra aqui, sin importar el rol: cambiar el PIN
 * propio no es una operacion de administracion, es higiene basica, y tener que
 * pedirselo a otro es lo que hace que los PIN no se cambien nunca.
 */

import { redirect } from 'next/navigation';

import { Cabecera } from '@/components/Cabecera';
import { PanelMiCuenta } from '@/components/PanelMiCuenta';
import { prisma } from '@/lib/db/prisma';
import { cajeroDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function MiCuenta() {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');

  const sesionesAbiertas = await prisma.sesion.count({
    where: { cajeroId: cajero.id, expiraEn: { gt: new Date() } },
  });

  return (
    <main className="mx-auto max-w-2xl p-5">
      <Cabecera
        migas={[{ etiqueta: 'Inicio', href: '/' }, { etiqueta: 'Mi cuenta' }]}
        usuario={cajero}
      />
      <h1 className="mb-6 text-3xl font-bold">Mi cuenta</h1>

      <PanelMiCuenta
        usuario={{ nombre: cajero.nombre, rol: cajero.rol }}
        sesionesAbiertas={sesionesAbiertas}
      />
    </main>
  );
}
