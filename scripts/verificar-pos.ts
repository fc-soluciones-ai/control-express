/**
 * Prueba de los pedidos que manda el agente del local.
 *
 * Lo que se vigila:
 *   1. Que no entre un envio sin firma, con firma vieja o con firma ajena.
 *   2. Que el pedido se ligue al cliente y al repartidor por su clave, nunca
 *      por el nombre.
 *   3. Que el mismo pedido mandado dos veces no se duplique y que el POS
 *      siempre gane.
 *   4. Que el dinero quede en centimos enteros.
 *
 * Ejecutar con: npm run test:pos
 */

import { createHmac } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { calidadDeDireccion, nombreBuscable } from '@/lib/clientes/normalizar';
import {
  claveDelPos,
  envioValido,
  estadoDelPedido,
  sincronizarPedidos,
  type PedidoDelPos,
} from '@/server/services/pos';
import { exigirBaseDePruebas } from './guarda-pruebas';

let fallos = 0;

function comprobar(descripcion: string, real: unknown, esperado: unknown): void {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos += 1;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${descripcion}`);
  if (!ok) {
    console.log(`      esperado: ${JSON.stringify(esperado)}`);
    console.log(`      obtenido: ${JSON.stringify(real)}`);
  }
}

const SECRETO = 'secreto-del-agente';
const ahora = () => String(Math.floor(Date.now() / 1000));
const firmar = (hora: string, cuerpo: string) =>
  createHmac('sha256', SECRETO).update(`${hora}.${cuerpo}`, 'utf8').digest('hex');

async function limpiar(): Promise<void> {
  await prisma.pedido.deleteMany();
  await prisma.telefonoCliente.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.chofer.deleteMany();
  await prisma.eventoAuditoria.deleteMany();
  await prisma.cajero.deleteMany();
}

async function main(): Promise<void> {
  exigirBaseDePruebas();
  await limpiar();
  process.env.POS_AGENTE_SECRETO = SECRETO;

  // ===========================================================================
  console.log('--- La firma del agente ---');

  const cuerpo = '{"pedidos":[]}';
  const hora = ahora();
  comprobar('una firma buena pasa', envioValido(cuerpo, firmar(hora, cuerpo), hora), true);
  comprobar('sin firma no pasa', envioValido(cuerpo, null, hora), false);
  comprobar('sin hora no pasa', envioValido(cuerpo, firmar(hora, cuerpo), null), false);
  comprobar(
    'la firma de otro cuerpo no pasa',
    envioValido(cuerpo, firmar(hora, '{"pedidos":[{}]}'), hora),
    false,
  );
  comprobar('basura en la firma no pasa', envioValido(cuerpo, 'zzzz', hora), false);

  // Un envio grabado y repetido manana no sirve.
  const viejo = String(Math.floor(Date.now() / 1000) - 3600);
  comprobar('un envio de hace una hora no pasa', envioValido(cuerpo, firmar(viejo, cuerpo), viejo), false);
  const futuro = String(Math.floor(Date.now() / 1000) + 3600);
  comprobar('uno del futuro tampoco', envioValido(cuerpo, firmar(futuro, cuerpo), futuro), false);

  const guardado = process.env.POS_AGENTE_SECRETO;
  delete process.env.POS_AGENTE_SECRETO;
  comprobar('sin secreto configurado no pasa nada', envioValido(cuerpo, firmar(hora, cuerpo), hora), false);
  process.env.POS_AGENTE_SECRETO = guardado;

  // ===========================================================================
  console.log('\n--- La clave del pedido ---');
  comprobar('con serie', claveDelPos({ folio: '12345', serieFolio: 'A' }), 'A-12345');
  comprobar('sin serie', claveDelPos({ folio: '12345', serieFolio: null }), '12345');
  comprobar('con serie vacia', claveDelPos({ folio: '12345', serieFolio: '  ' }), '12345');

  console.log('\n--- En que punto va el pedido ---');
  const d = (s: string) => new Date(s);
  // Una cuenta ABIERTA, que es donde vive un pedido mientras el repartidor
  // anda en la calle. Lo cerrado se prueba aparte, mas abajo.
  const vacias = {
    abierta: true,
    pagado: false,
    llegoEn: null,
    salioEn: null,
    asignadoEn: null,
    empaquetadoEn: null,
    cerradoEn: null,
  };
  comprobar('recien entrado', estadoDelPedido(vacias), 'RECIBIDO');
  comprobar('empaquetado', estadoDelPedido({ ...vacias, empaquetadoEn: d('2026-10-04T19:20:00Z') }), 'EN_COCINA');
  comprobar('asignado', estadoDelPedido({ ...vacias, asignadoEn: d('2026-10-04T19:25:00Z') }), 'ASIGNADO');
  comprobar('en camino', estadoDelPedido({ ...vacias, salioEn: d('2026-10-04T19:30:00Z') }), 'EN_CAMINO');
  comprobar('entregado', estadoDelPedido({ ...vacias, llegoEn: d('2026-10-04T20:00:00Z') }), 'ENTREGADO');
  comprobar('cancelado manda sobre todo', estadoDelPedido({ ...vacias, cancelado: true, llegoEn: d('2026-10-04T20:00:00Z') }), 'CANCELADO');
  // Hoy el POS no llena empaquetado ni asignacion, asi que un pedido salta de
  // RECIBIDO a EN_CAMINO. Gana siempre la marca mas avanzada.
  comprobar(
    'gana la marca mas avanzada',
    estadoDelPedido({ ...vacias, empaquetadoEn: d('2026-10-04T19:20:00Z'), salioEn: d('2026-10-04T19:30:00Z') }),
    'EN_CAMINO',
  );

  // ===========================================================================
  console.log('\n--- La marca de cierre NO es la entrega ---');
  // ===========================================================================
  //
  // Los numeros son de las cuentas abiertas del local, el 4 de octubre. El
  // cierre cae UN SEGUNDO despues de la salida: no es la hora en que llego, es
  // el momento en que el cajero cierra la cuenta y manda la moto. Tomarlo como
  // entrega daba por terminado el pedido justo cuando empezaba a viajar, y
  // dejaba el tablero vacio para siempre.
  comprobar(
    'el folio 197003 sigue en la calle',
    estadoDelPedido({
      ...vacias,
      salioEn: d('2026-10-04T19:54:03-06:00'),
      cerradoEn: d('2026-10-04T19:54:04-06:00'),
    }),
    'EN_CAMINO',
  );
  comprobar(
    'y uno cerrado sin salir sigue en el local',
    estadoDelPedido({ ...vacias, cerradoEn: d('2026-10-04T18:58:21-06:00') }),
    'RECIBIDO',
  );
  // El folio 197002: pagado con tarjeta. En un domicilio se cobra al entregar.
  comprobar(
    'una cuenta ya cobrada se da por entregada',
    estadoDelPedido({ ...vacias, salioEn: d('2026-10-04T19:53:10-06:00'), pagado: true }),
    'ENTREGADO',
  );
  // Lo que ya paso a dbo.cheques se liquido con el turno: terminado.
  comprobar(
    'lo que ya no esta abierto esta terminado',
    estadoDelPedido({ ...vacias, abierta: false }),
    'ENTREGADO',
  );
  comprobar(
    'pero un cancelado sigue siendo cancelado',
    estadoDelPedido({ ...vacias, abierta: false, cancelado: true }),
    'CANCELADO',
  );
  // Un agente viejo no manda `abierta`. Para el, todo venia de dbo.cheques.
  comprobar(
    'sin el dato, se asume cerrado como hacia el agente viejo',
    estadoDelPedido({
      llegoEn: null,
      salioEn: null,
      asignadoEn: null,
      empaquetadoEn: null,
      cerradoEn: null,
    }),
    'ENTREGADO',
  );

  // ===========================================================================
  console.log('\n--- Guardar un lote ---');

  const direccion = 'CEBADILLA, 200 METROS OESTE DEL BAR, PORTON VERDE';
  const maria = await prisma.cliente.create({
    data: {
      clave: '008686',
      nombre: 'MARIA RODRIGUEZ',
      nombreBuscable: nombreBuscable('MARIA RODRIGUEZ'),
      telefono: '87069355',
      esCelular: true,
      direccionTexto: direccion,
      calidadDireccion: calidadDeDireccion(direccion),
      estado: 'LISTO',
      origenCarga: 'PRUEBA',
    },
  });
  const pinito = await prisma.chofer.create({
    data: {
      idMeseroSoftRestaurant: '12',
      nombre: 'PINITO-R',
      nombreNormalizado: 'PINITO-R',
    },
  });

  const lote: PedidoDelPos[] = [
    {
      folio: '12345',
      serieFolio: 'A',
      claveCliente: '008686',
      idDireccion: 'D1',
      telefonoUsado: '87069355',
      idMesero: '12',
      entroEn: '2026-10-04T19:05:00.000Z',
      salioEn: '2026-10-04T19:36:00.000Z',
      // La cuenta sigue abierta: el repartidor anda en la calle con el.
      abierta: true,
      esADomicilio: true,
      total: 12500.5,
    },
    {
      // Un cliente que el POS conoce y nosotros todavia no.
      folio: '12346',
      claveCliente: '999999',
      idMesero: '99',
      entroEn: '2026-10-04T19:10:00.000Z',
      esADomicilio: true,
      total: 8000,
    },
  ];

  const r1 = await sincronizarPedidos(lote);
  comprobar('se recibieron los dos', r1.recibidos, 2);
  comprobar('los dos son nuevos', r1.nuevos, 2);
  comprobar('uno se ligo al cliente', r1.ligadosACliente, 1);
  comprobar('uno se ligo al repartidor', r1.ligadosARepartidor, 1);
  comprobar('ninguno rechazado', r1.rechazados.length, 0);

  const guardadoA = await prisma.pedido.findUnique({ where: { claveDelPos: 'A-12345' } });
  comprobar('quedo con la clave del POS', guardadoA?.claveDelPos, 'A-12345');
  comprobar('ligado a Maria', guardadoA?.clienteId, maria.id);
  comprobar('y a PINITO', guardadoA?.choferId, pinito.id);
  comprobar('en camino', guardadoA?.estado, 'EN_CAMINO');
  // Todo el dinero del sistema son centimos enteros.
  comprobar('el total quedo en centimos', guardadoA?.total, 1250050);

  const guardadoB = await prisma.pedido.findUnique({ where: { claveDelPos: '12346' } });
  comprobar('el cliente desconocido queda sin ligar', guardadoB?.clienteId, null);
  // Pero la clave se guarda igual: el dia que se importe ese cliente, se liga.
  comprobar('aunque su clave se conserva', guardadoB?.claveCliente, '999999');
  comprobar('y el repartidor desconocido tambien', guardadoB?.choferId, null);

  console.log('\n--- El POS siempre manda ---');

  // El mismo pedido, ahora con la llegada marcada.
  const r2 = await sincronizarPedidos([
    { ...lote[0]!, llegoEn: '2026-10-04T20:01:00.000Z' },
  ]);
  comprobar('no se duplica', r2.nuevos, 0);
  comprobar('se actualiza', r2.actualizados, 1);
  comprobar('sigue habiendo dos pedidos', await prisma.pedido.count(), 2);
  const trasActualizar = await prisma.pedido.findUnique({ where: { claveDelPos: 'A-12345' } });
  comprobar('y ahora esta entregado', trasActualizar?.estado, 'ENTREGADO');

  console.log('\n--- Lo que viene mal ---');

  const r3 = await sincronizarPedidos([
    { folio: '', entroEn: '2026-10-04T19:00:00.000Z' },
    { folio: '777', entroEn: 'esto no es una fecha' },
    { folio: '888', entroEn: '2026-10-04T19:00:00.000Z' },
  ]);
  comprobar('se rechazan los dos malos', r3.rechazados.length, 2);
  // Lo importante: un pedido malo no bota a los buenos del mismo lote.
  comprobar('y el bueno entra igual', r3.nuevos, 1);

  let mensaje = '';
  try {
    await sincronizarPedidos(new Array(501).fill(lote[0]));
  } catch (e) {
    mensaje = e instanceof Error ? e.message : '';
  }
  comprobar('un lote gigante se rechaza entero', mensaje, 'Maximo 500 pedidos por envio.');

  // ===========================================================================
  console.log('\n--- Lo que reemplaza al Excel de cada noche ---');

  await prisma.pedido.deleteMany();
  const dia = '2026-10-04';
  // El dia operativo va de las 6 de la manana a las 6 de la manana siguiente:
  // un pedido de la una de la madrugada es de la noche anterior.
  const delDia: PedidoDelPos[] = [
    {
      folio: '900',
      claveCliente: '008686',
      idMesero: '12',
      entroEn: '2026-10-04T19:00:00',
      esADomicilio: true,
      total: 10000,
      efectivo: 10000,
    },
    {
      folio: '901',
      claveCliente: '008686',
      idMesero: '12',
      entroEn: '2026-10-04T20:30:00',
      esADomicilio: true,
      total: 8000,
      efectivo: 0,
      tarjeta: 8000,
    },
    {
      // Una de la madrugada: pertenece al dia operativo anterior, el 4.
      folio: '902',
      claveCliente: '008686',
      idMesero: '12',
      entroEn: '2026-10-05T01:15:00',
      esADomicilio: true,
      total: 5000,
      efectivo: 3000,
      otros: 2000,
    },
    {
      // Cancelado: no se cobra, asi que no se le pide al repartidor.
      folio: '903',
      idMesero: '12',
      entroEn: '2026-10-04T21:00:00',
      cancelado: true,
      total: 99000,
      efectivo: 99000,
    },
    {
      // De otro repartidor: no debe contarse en el de PINITO.
      folio: '904',
      idMesero: '10',
      entroEn: '2026-10-04T19:30:00',
      total: 7000,
      efectivo: 7000,
    },
  ];
  await sincronizarPedidos(delDia);

  // Los pedidos del dia quedan guardados y ligados a su repartidor. Lo que
  // antes se comprobaba aqui era la suma de efectivo para el cierre de caja;
  // esa parte salio del sistema y la suma con ella.
  const delRepartidor = await prisma.pedido.count({
    where: { choferId: pinito.id, cancelado: false },
  });
  comprobar('los pedidos quedan ligados al repartidor', delRepartidor, 3);

  await limpiar();
  console.log(`\n${fallos === 0 ? 'Todo bien' : `${fallos} fallas`}`);
  if (fallos > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
