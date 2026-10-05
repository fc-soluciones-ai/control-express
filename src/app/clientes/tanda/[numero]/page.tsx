/**
 * La lista de envio de una tanda de WhatsApp.
 *
 * Esto era un Excel que alguien bajaba y abria al lado del WhatsApp Web. El
 * archivo salio por tres razones, en orden de peso:
 *
 * 1. Quedaba en el disco de la computadora del mostrador, con nombre, telefono
 *    y direccion de ciento cincuenta personas, y nadie lo borraba.
 * 2. Un archivo viejo no sabe que la tanda ya se mando, asi que daba lo mismo
 *    abrir el de ayer y volver a escribirle a todo el mundo.
 * 3. Un enlace en una celda de Excel pide dos clics y a veces no abre.
 *
 * Aqui los enlaces estan en la pantalla, la pantalla siempre dice el estado de
 * hoy, y no queda nada guardado en ninguna parte.
 *
 * El mensaje tambien se muestra completo, para quien prefiera copiarlo y
 * pegarlo a mano.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Cabecera } from '@/components/Cabecera';
import { telefonoBonito } from '@/lib/clientes/normalizar';
import { tienePermiso } from '@/server/permisos';
import { cajeroDeSesion } from '@/server/services/sesion';
import { tandaPorNumero } from '@/server/services/ubicaciones';

export const dynamic = 'force-dynamic';

export default async function Tanda({ params }: { params: { numero: string } }) {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  if (!tienePermiso(cajero.rol, 'CLIENTES')) redirect('/');

  const numero = Number(params.numero);
  if (!Number.isInteger(numero) || numero < 1) notFound();

  const lineas = await tandaPorNumero(numero);
  if (lineas.length === 0) notFound();

  return (
    <main className="mx-auto max-w-4xl p-5">
      <Cabecera
        migas={[
          { etiqueta: 'Clientes', href: '/clientes' },
          { etiqueta: `Tanda ${numero}` },
        ]}
        usuario={cajero}
      />

      <div className="mb-5">
        <h1 className="text-3xl font-bold">Tanda {numero}</h1>
        <p className="text-slate-400">
          {lineas.length} mensaje{lineas.length === 1 ? '' : 's'} por mandar
        </p>
      </div>

      <section className="tarjeta mb-5 p-5">
        <h2 className="text-lg font-bold">Como se manda</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-300">
          <li>Abra WhatsApp con el numero de la pizzeria, en el telefono o en la computadora.</li>
          <li>Toque &quot;Abrir WhatsApp&quot; en cada fila. El texto ya va escrito; revise y mande.</li>
          <li>Cuando termine la tanda, vuelva a la pantalla de clientes y marquela como enviada.</li>
        </ol>
        <div className="mt-4 rounded-2xl bg-alerta/10 p-4 text-sm text-slate-300">
          <p className="font-bold text-alerta">Lo que no hay que hacer</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>No mandar mas de una tanda por dia: Meta bloquea el numero por envios masivos.</li>
            <li>
              No cambiar el texto para que suene mas urgente. Un cliente molesto bloquea el numero.
            </li>
            <li>
              No insistirle a quien no contesto. La siguiente tanda lo vuelve a incluir si hace
              falta.
            </li>
          </ul>
        </div>
      </section>

      <ol className="space-y-3">
        {lineas.map((linea, i) => (
          <li key={linea.id} className="tarjeta p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {i + 1} de {lineas.length} · clave {linea.clave}
                </p>
                <p className="text-lg font-bold">{linea.nombre}</p>
                <p className="cifra text-slate-300">{telefonoBonito(linea.telefono)}</p>
              </div>
              <a
                href={linea.enlaceWhatsApp}
                target="_blank"
                rel="noreferrer"
                className="boton-tactil bg-entrada px-6 text-slate-950"
              >
                Abrir WhatsApp
              </a>
            </div>

            <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
              Direccion que tenemos
            </p>
            <p className="text-sm text-slate-300">{linea.direccionActual}</p>

            <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Mensaje</p>
            <p className="mt-1 whitespace-pre-wrap rounded-2xl border border-borde bg-fondo p-3 text-sm text-slate-200">
              {linea.mensaje}
            </p>
          </li>
        ))}
      </ol>

      <Link
        href="/clientes"
        className="boton-tactil mt-6 flex w-full items-center justify-center border border-borde bg-panelClaro text-slate-200"
      >
        Volver a clientes
      </Link>
    </main>
  );
}
