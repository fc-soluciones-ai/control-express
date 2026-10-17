/**
 * Lo que un repartidor ve de si mismo.
 *
 * Todas las consultas de aqui filtran por el id que viene de SU sesion, nunca
 * por uno que llegue de la pantalla. Es la diferencia entre "solo ve lo suyo"
 * y "ve lo de cualquiera que sepa cambiar un numero en la direccion".
 *
 * No hay nada que escriba en este archivo, y es a proposito: el repartidor
 * consulta. Quien mueve el estado de un pedido es el local.
 *
 * Lo que le sirve para trabajar: los pedidos de la app que le dieron (con la
 * ubicacion del cliente para abrir Waze), los del sistema de la pizzeria que
 * lleva en la calle, y la moto que trae hoy.
 */

import { diaOperativoDe, rangoDiaOperativo } from '@/lib/fechas';
import { prisma } from '@/lib/db/prisma';
import type { Coordenada } from '@/lib/pedido/envio';

export interface ResumenDelRepartidor {
  diaOperativo: string;
  /** Cuantos pedidos le atribuye el POS hoy. */
  pedidosHoy: number;
  /** De esos, cuantos ya marco como entregados. */
  entregadosHoy: number;
  /** Los que todavia tiene en la calle, del mas viejo al mas nuevo. */
  enCamino: Array<{
    id: string;
    folio: string;
    cliente: string | null;
    direccion: string | null;
    salioEn: Date | null;
  }>;
  /** Los pedidos de la app que le asigno el local y todavia no se entregan. */
  pedidosApp: Array<{
    id: string;
    numero: number;
    estado: string;
    nombre: string;
    telefono: string;
    direccion: string;
    referencia: string | null;
    ubicacion: Coordenada | null;
    metodoPago: string;
    /** Lo que tiene que cobrar en la puerta, en centimos. Cero si ya pago. */
    porCobrar: number;
    pagaCon: number | null;
  }>;
  /** Su moto de hoy, si trae alguna. */
  moto: { placa: string; marca: string; modelo: string } | null;
}

export async function resumenDelRepartidor(choferId: string): Promise<ResumenDelRepartidor> {
  const dia = diaOperativoDe();
  // El dia operativo no es el del calendario: va de las seis de la manana a
  // las seis de la manana siguiente, porque la pizzeria cierra de madrugada.
  const { desde, hasta } = rangoDiaOperativo(dia);
  const delDia = { choferId, entroEn: { gte: desde, lt: hasta }, cancelado: false };

  const [pedidosHoy, entregadosHoy, enCamino, pedidosApp, asignacion] = await Promise.all([
    prisma.pedido.count({ where: delDia }),
    prisma.pedido.count({ where: { ...delDia, estado: 'ENTREGADO' } }),
    prisma.pedido.findMany({
      where: { ...delDia, estado: 'EN_CAMINO' },
      orderBy: { salioEn: 'asc' },
      take: 20,
      include: { cliente: { select: { nombre: true, direccionTexto: true } } },
    }),
    prisma.pedidoApp.findMany({
      where: { choferId, estado: { in: ['ACEPTADO', 'EN_COCINA', 'EN_CAMINO'] } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    prisma.asignacionMoto.findFirst({
      where: { choferId, fechaFin: null },
      include: { moto: true },
    }),
  ]);

  return {
    diaOperativo: dia,
    pedidosHoy,
    entregadosHoy,
    enCamino: enCamino.map((p) => ({
      id: p.id,
      folio: p.folio,
      cliente: p.cliente?.nombre ?? null,
      direccion: p.cliente?.direccionTexto ?? null,
      salioEn: p.salioEn,
    })),
    pedidosApp: pedidosApp.map((p) => ({
      id: p.id,
      numero: p.numero,
      estado: p.estado,
      nombre: p.nombre,
      telefono: p.telefono,
      direccion: p.direccion,
      referencia: p.referencia,
      ubicacion: p.latitud !== null && p.longitud !== null ? { lat: p.latitud, lng: p.longitud } : null,
      metodoPago: p.metodoPago,
      porCobrar: p.metodoPago === 'EFECTIVO' ? p.total : 0,
      pagaCon: p.pagaCon,
    })),
    moto: asignacion
      ? { placa: asignacion.moto.placa, marca: asignacion.moto.marca, modelo: asignacion.moto.modelo }
      : null,
  };
}
