/**
 * Consulta de la base de clientes.
 *
 * Son casi diez mil fichas, asi que aqui no se filtra en memoria como en la
 * flota: la consulta va a la base con su pagina y su orden. El estado del
 * filtro vive en la direccion (ver lib/consulta.ts), no en el componente.
 */

import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';

import { nombreBuscable } from '@/lib/clientes/normalizar';
import { ESTADO_CLIENTE, type EstadoCliente } from '@/types/enums';

export interface FiltrosDeClientes {
  buscar?: string;
  estado?: string;
  /** SI muestra solo los que ya mandaron un punto; NO los que faltan. */
  conUbicacion?: string;
  /** SI muestra solo los marcados como repetidos. */
  repetidos?: string;
}

/**
 * Traduce los filtros de la direccion a una condicion de Prisma.
 *
 * El texto de busqueda se compara contra el nombre normalizado y contra la
 * clave y el telefono, porque en el mostrador se busca por lo que el cliente
 * diga: su nombre, su numero, o el codigo que le canta el POS.
 */
export function condicionDeClientes(filtros: FiltrosDeClientes): Prisma.ClienteWhereInput {
  const condiciones: Prisma.ClienteWhereInput[] = [];

  const texto = (filtros.buscar ?? '').trim();
  if (texto !== '') {
    const soloDigitos = texto.replace(/\D/g, '');
    condiciones.push({
      OR: [
        { nombreBuscable: { contains: nombreBuscable(texto) } },
        { clave: { contains: texto } },
        ...(soloDigitos.length >= 4
          ? [
              { telefono: { contains: soloDigitos } },
              { telefonos: { some: { numero: { contains: soloDigitos } } } },
            ]
          : []),
        // La direccion se busca tal cual: el texto original tiene acentos y
        // mayusculas mezcladas, asi que la comparacion ignora el caso.
        { direccionTexto: { contains: texto, mode: 'insensitive' as const } },
      ],
    });
  }

  if (filtros.estado && (ESTADO_CLIENTE as ReadonlyArray<string>).includes(filtros.estado)) {
    condiciones.push({ estado: filtros.estado as EstadoCliente });
  }

  if (filtros.conUbicacion === 'SI') condiciones.push({ ubicaciones: { some: {} } });
  if (filtros.conUbicacion === 'NO') condiciones.push({ ubicaciones: { none: {} } });

  if (filtros.repetidos === 'SI') {
    condiciones.push({ OR: [{ telefonoCompartido: true }, { nombreRepetido: true }] });
  }

  return condiciones.length === 0 ? {} : { AND: condiciones };
}

export async function contarClientes(filtros: FiltrosDeClientes): Promise<number> {
  return prisma.cliente.count({ where: condicionDeClientes(filtros) });
}

export async function listarClientes(
  filtros: FiltrosDeClientes,
  limite: number,
  saltar: number,
) {
  return prisma.cliente.findMany({
    where: condicionDeClientes(filtros),
    orderBy: [{ nombreBuscable: 'asc' }],
    take: limite,
    skip: saltar,
    include: {
      // Solo la ultima: la tabla no necesita el historial completo.
      ubicaciones: { orderBy: { creadaEn: 'desc' }, take: 1 },
      solicitudes: { orderBy: { creadaEn: 'desc' }, take: 1 },
      _count: { select: { telefonos: true, ubicaciones: true } },
    },
  });
}

/** Cuantos hay en cada estado, para los botones de filtro. */
export async function conteoPorEstado(): Promise<Array<{ estado: string; cuantos: number }>> {
  const filas = await prisma.cliente.groupBy({ by: ['estado'], _count: { _all: true } });
  return filas
    .map((f) => ({ estado: f.estado, cuantos: f._count._all }))
    .sort((a, b) => b.cuantos - a.cuantos);
}

/** La ficha completa de un cliente, con su historial de ubicaciones. */
export async function fichaDeCliente(clave: string) {
  return prisma.cliente.findUnique({
    where: { clave },
    include: {
      telefonos: { orderBy: { createdAt: 'asc' } },
      ubicaciones: { orderBy: { creadaEn: 'desc' }, include: { chofer: { select: { nombre: true } } } },
      solicitudes: { orderBy: { creadaEn: 'desc' } },
    },
  });
}
