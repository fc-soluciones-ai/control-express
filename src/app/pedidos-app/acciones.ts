'use server';

/**
 * Lo que se puede hacer desde la pantalla de pedidos de la app.
 *
 * Todo exige sesion y el permiso de operacion. Abrir o cerrar la recepcion de
 * pedidos es el interruptor de emergencia: queda en la bitacora con quien lo hizo.
 */

import { exigirPermiso } from '@/server/permisos';
import { exigirCajero } from '@/server/services/sesion';
import {
  AJUSTE_SINPE_NOMBRE,
  AJUSTE_SINPE_NUMERO,
  cambiarEstadoDePedidoApp,
  configDeEnvio,
  datosSinpe,
  fijarConfigDeEnvio,
  fijarPedidosAbiertos,
  guardarAjuste,
  pedidosAbiertos,
  pedidosParaElLocal,
  verificarPagoDePedidoApp,
  type ConfigDeEnvio,
  type DatosSinpe,
  type EstadoDePedidoApp,
  type PedidoParaElLocal,
} from '@/server/services/pedidos-app';

export interface EstadoDeLaPantalla {
  abierto: boolean;
  sinpe: DatosSinpe | null;
  envio: ConfigDeEnvio;
  pedidos: PedidoParaElLocal[];
}

export async function accionLeerPedidosApp(): Promise<EstadoDeLaPantalla> {
  const usuario = await exigirCajero();
  exigirPermiso(usuario, 'OPERACION');
  const [abierto, sinpe, envio, pedidos] = await Promise.all([
    pedidosAbiertos(),
    datosSinpe(),
    configDeEnvio(),
    pedidosParaElLocal(),
  ]);
  return { abierto, sinpe, envio, pedidos };
}

export async function accionGuardarEnvio(modo: 'FIJO' | 'DISTANCIA', fijoEnColones: number): Promise<void> {
  const usuario = await exigirCajero();
  exigirPermiso(usuario, 'OPERACION');
  await fijarConfigDeEnvio(modo, fijoEnColones, usuario.id);
}

export async function accionAbrirOCerrar(abierto: boolean): Promise<void> {
  const usuario = await exigirCajero();
  exigirPermiso(usuario, 'OPERACION');
  await fijarPedidosAbiertos(abierto, usuario.id);
}

export async function accionCambiarEstado(id: string, estado: EstadoDePedidoApp): Promise<void> {
  const usuario = await exigirCajero();
  exigirPermiso(usuario, 'OPERACION');
  await cambiarEstadoDePedidoApp(id, estado, usuario.id);
}

export async function accionVerificarPago(id: string): Promise<void> {
  const usuario = await exigirCajero();
  exigirPermiso(usuario, 'OPERACION');
  await verificarPagoDePedidoApp(id, usuario.id);
}

export async function accionGuardarSinpe(numero: string, nombre: string): Promise<void> {
  const usuario = await exigirCajero();
  exigirPermiso(usuario, 'OPERACION');
  const limpio = numero.replace(/\D/g, '');
  if (limpio !== '' && !/^[2-8]\d{7}$/.test(limpio)) {
    throw new Error('El número de SINPE debe tener 8 dígitos.');
  }
  await guardarAjuste(AJUSTE_SINPE_NUMERO, limpio);
  await guardarAjuste(AJUSTE_SINPE_NOMBRE, nombre.trim().slice(0, 60));
}
