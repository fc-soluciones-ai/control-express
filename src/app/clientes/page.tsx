/**
 * Clientes y el proyecto de ubicaciones.
 *
 * Dos trabajos en una pantalla porque son el mismo: mirar en que estado esta
 * la base, y sacar la siguiente tanda de mensajes de WhatsApp para arreglarla.
 *
 * La tabla es de casi diez mil filas, asi que el filtro y la pagina viven en
 * la direccion y la consulta va a la base (ver lib/consulta.ts). Al contrario
 * de la flota, aqui no se puede traer todo y filtrar en memoria.
 */

import { redirect } from 'next/navigation';

import { Cabecera } from '@/components/Cabecera';
import { PanelClientes } from '@/components/PanelClientes';
import { paginaDe, tamanoDePagina } from '@/lib/consulta';
import { tienePermiso } from '@/server/permisos';
import {
  conteoPorEstado,
  contarClientes,
  listarClientes,
  type FiltrosDeClientes,
} from '@/server/services/clientes';
import { cajeroDeSesion } from '@/server/services/sesion';
import {
  avanceDelProyecto,
  ubicacionesPorRevisar,
  vencerSolicitudesViejas,
} from '@/server/services/ubicaciones';

export const dynamic = 'force-dynamic';

interface Parametros extends FiltrosDeClientes {
  pagina?: string;
  tamano?: string;
}

export default async function Clientes({ searchParams }: { searchParams: Parametros }) {
  const cajero = await cajeroDeSesion();
  if (!cajero) redirect('/entrar');
  // Sin el rol, la pantalla no se abre: esconder el boton no basta.
  if (!tienePermiso(cajero.rol, 'CLIENTES')) redirect('/sin-permiso');

  // El proyecto dura unas semanas: no vale la pena un trabajo programado solo
  // para cerrar los enlaces vencidos, se cierran al abrir la pantalla.
  await vencerSolicitudesViejas();

  const filtros: FiltrosDeClientes = {
    buscar: searchParams.buscar,
    estado: searchParams.estado,
    conUbicacion: searchParams.conUbicacion,
    repetidos: searchParams.repetidos,
  };
  const pagina = paginaDe(searchParams.pagina);
  const tamano = tamanoDePagina(searchParams.tamano);

  const [avance, estados, total, filas, porRevisar] = await Promise.all([
    avanceDelProyecto(),
    conteoPorEstado(),
    contarClientes(filtros),
    listarClientes(filtros, tamano, (pagina - 1) * tamano),
    ubicacionesPorRevisar(30),
  ]);

  return (
    <>
      <Cabecera
        migas={[{ etiqueta: 'Inicio', href: '/' }, { etiqueta: 'Clientes' }]}
        usuario={{ nombre: cajero.nombre, rol: cajero.rol }}
      />
      <PanelClientes
        avance={avance}
        estados={estados}
        total={total}
        pagina={pagina}
        tamano={tamano}
        filas={filas.map((c) => ({
          clave: c.clave,
          nombre: c.nombre,
          telefono: c.telefono,
          esCelular: c.esCelular,
          direccionTexto: c.direccionTexto,
          calidadDireccion: c.calidadDireccion,
          estado: c.estado,
          telefonoCompartido: c.telefonoCompartido,
          nombreRepetido: c.nombreRepetido,
          cuantasUbicaciones: c._count.ubicaciones,
          ultimaSolicitud: c.solicitudes[0]
            ? { estado: c.solicitudes[0].estado, tanda: c.solicitudes[0].tanda }
            : null,
        }))}
        porRevisar={porRevisar.map((u) => ({
          id: u.id,
          clave: u.cliente.clave,
          nombre: u.cliente.nombre,
          direccionTexto: u.cliente.direccionTexto,
          latitud: u.latitud,
          longitud: u.longitud,
          precisionMetros: u.precisionMetros,
          nota: u.nota,
          origen: u.origen,
          creadaEn: u.creadaEn.toISOString(),
        }))}
      />
    </>
  );
}
