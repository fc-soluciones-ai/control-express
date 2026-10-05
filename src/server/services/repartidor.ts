/**
 * Lo que un repartidor ve de si mismo.
 *
 * Todas las consultas de aqui filtran por el id que viene de SU sesion, nunca
 * por uno que llegue de la pantalla. Es la diferencia entre "solo ve lo suyo"
 * y "ve lo de cualquiera que sepa cambiar un numero en la direccion".
 *
 * No hay nada que escriba en este archivo, y es a proposito: el repartidor
 * consulta. Lo que registra, cuando llegue su pantalla de entregas, va a ir en
 * otro modulo y con su propia firma.
 *
 * Esto mostraba lo que habia entregado de efectivo en su turno. Al quitarse
 * todo lo contable, lo que le sirve de verdad es lo mismo que necesita para
 * trabajar: que moto trae, que le falta a esa moto, y cuantos pedidos lleva
 * hoy.
 */

import { diaOperativoDe, rangoDiaOperativo } from '@/lib/fechas';
import { prisma } from '@/lib/db/prisma';
import { alertasDeFlota, type AlertaMoto } from '@/server/services/mantenimiento';

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
  /** Su moto de hoy, si trae alguna. */
  moto: {
    placa: string;
    marca: string;
    modelo: string;
    kilometraje: number;
    estado: string;
    prestada: boolean;
    alertas: AlertaMoto[];
  } | null;
}

export async function resumenDelRepartidor(choferId: string): Promise<ResumenDelRepartidor> {
  const dia = diaOperativoDe();
  // El dia operativo no es el del calendario: va de las seis de la manana a
  // las seis de la manana siguiente, porque la pizzeria cierra de madrugada.
  const { desde, hasta } = rangoDiaOperativo(dia);
  const delDia = { choferId, entroEn: { gte: desde, lt: hasta }, cancelado: false };

  const [pedidosHoy, entregadosHoy, enCamino, asignacion] = await Promise.all([
    prisma.pedido.count({ where: delDia }),
    prisma.pedido.count({ where: { ...delDia, estado: 'ENTREGADO' } }),
    prisma.pedido.findMany({
      where: { ...delDia, estado: 'EN_CAMINO' },
      orderBy: { salioEn: 'asc' },
      take: 20,
      include: { cliente: { select: { nombre: true, direccionTexto: true } } },
    }),
    prisma.asignacionMoto.findFirst({
      where: { choferId, fechaFin: null },
      include: { moto: true },
    }),
  ]);

  let moto: ResumenDelRepartidor['moto'] = null;
  if (asignacion) {
    const todas = await alertasDeFlota();
    moto = {
      placa: asignacion.moto.placa,
      marca: asignacion.moto.marca,
      modelo: asignacion.moto.modelo,
      kilometraje: asignacion.moto.kilometrajeActual,
      estado: asignacion.moto.estado,
      prestada: asignacion.tipo === 'COMODIN',
      alertas: todas.filter((a) => a.placa === asignacion.moto.placa),
    };
  }

  return {
    diaOperativo: dia,
    pedidosHoy,
    entregadosHoy,
    enCamino: enCamino.map((p) => ({
      id: p.id,
      folio: p.folio,
      // Puede no estar ligado todavia: el cliente del POS entra en la
      // siguiente pasada del agente.
      cliente: p.cliente?.nombre ?? null,
      direccion: p.cliente?.direccionTexto ?? null,
      salioEn: p.salioEn,
    })),
    moto,
  };
}
