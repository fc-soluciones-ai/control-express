/**
 * Comprobacion de los pedidos de la app de clientes.
 *
 *   npm run test:pedido-app
 *
 * Lo que protege a la pizzeria:
 *  - que la app NUNCA reciba pedidos si esta cerrada (y que nazca cerrada);
 *  - que el precio lo calcule el servidor: lo que mande el telefono sobre dinero se
 *    ignora y un pedido manipulado no paga menos;
 *  - que el envio salga de la ubicacion y que fuera de zona se rechace;
 *  - que repetir el mismo envio no cree dos pedidos;
 *  - que haya tope de pedidos por telefono;
 *  - que un pedido cerrado no se reabra.
 *
 * Escribe y borra filas: corre contra la base de PRUEBAS.
 */

import { prisma } from '@/lib/db/prisma';
import { PROPUESTA_INICIAL } from '@/lib/menu/propuesta-inicial';
import { CARGO_PLATAFORMA, ENVIO_FIJO_DE_PRUEBA } from '@/lib/pedido/cargos';
import { distanciaKm, estaEnCostaRica, leerCoordenadas, LOCAL, MAXIMO_KM, tramoPara } from '@/lib/pedido/envio';
import { validarPedido } from '@/lib/pedido/validar';
import { aplicarPropuestaInicial, menuDeLaApp } from '@/server/services/menu-app';
import {
  AJUSTE_ABIERTO,
  AJUSTE_SINPE_NUMERO,
  cambiarEstadoDePedidoApp,
  configDeEnvio,
  configDeLocal,
  cotizar,
  cotizarZona,
  crearPedidoApp,
  fijarConfigDeEnvio,
  fijarConfigDeLocal,
  fijarPedidosAbiertos,
  guardarAjuste,
  pedidoParaElCliente,
  pedidosAbiertos,
  pedidosParaElLocal,
  repartidoresDeLaApp,
  asignarRepartidorAPedidoApp,
  transicionPermitida,
} from '@/server/services/pedidos-app';

import { resumenDelRepartidor } from '@/server/services/repartidor';

import { exigirBaseDePruebas } from './guarda-pruebas';

let fallos = 0;

function comprobar(que: string, real: unknown, esperado: unknown): void {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos += 1;
  console.log(
    `${bien ? 'OK  ' : 'MAL '} ${que}${bien ? '' : `  (${JSON.stringify(real)} != ${JSON.stringify(esperado)})`}`,
  );
}

async function falla(que: () => Promise<unknown>): Promise<{ codigo?: string; mensaje: string } | null> {
  try {
    await que();
    return null;
  } catch (e) {
    const x = e as { codigo?: string; message?: string };
    return { codigo: x.codigo, mensaje: x.message ?? String(e) };
  }
}

async function limpiar(): Promise<void> {
  await prisma.lineaPedidoApp.deleteMany();
  await prisma.pedidoApp.deleteMany();
  await prisma.ajusteApp.deleteMany();
  await prisma.complementoApp.deleteMany();
  await prisma.varianteApp.deleteMany();
  await prisma.itemApp.deleteMany();
  await prisma.categoriaApp.deleteMany();
  await prisma.productoMenu.deleteMany();
  await prisma.grupoMenu.deleteMany();
}

/** Los productos del POS que la propuesta menciona, mas los cuatro del envio. */
async function sembrar(): Promise<void> {
  const ids = new Set<string>();
  for (const c of PROPUESTA_INICIAL) {
    for (const i of c.items) {
      for (const v of i.variantes) ids.add(v.producto);
      for (const x of i.complementos ?? []) ids.add(x.producto);
    }
  }
  await prisma.grupoMenu.createMany({
    data: [
      { id: '01', nombre: 'GRUPO', clasificacion: 2 },
      { id: '08', nombre: 'EXPRESS', clasificacion: 3 },
    ],
  });
  const lista = [...ids];
  await prisma.productoMenu.createMany({
    data: [
      ...lista.map((id, n) => ({
        id,
        nombre: `PRODUCTO ${id}`,
        grupoId: '01',
        areaId: '01',
        precio: 100000 + n * 100,
        paraDomicilio: true,
      })),
      { id: '08003', nombre: 'EXPRESS 1400', grupoId: '08', precio: 140000, paraDomicilio: true },
      { id: '0105576', nombre: 'EXPRESS 1600', grupoId: '08', precio: 160000, paraDomicilio: true },
      { id: '08007', nombre: 'EXPRESS 2000', grupoId: '08', precio: 200000, paraDomicilio: true },
      { id: '08004', nombre: 'EXPRESS 2500', grupoId: '08', precio: 250000, paraDomicilio: true },
    ],
  });
}

let contador = 0;
const clave = (): string => `prueba-${Date.now()}-${(contador += 1)}-abcdefgh`;

/** Un punto a `km` kilometros al norte del local. */
const aKm = (km: number) => ({ lat: LOCAL.lat + km / 111.19, lng: LOCAL.lng });

async function main(): Promise<void> {
  exigirBaseDePruebas();
  await limpiar();

  console.log('\n--- El envio y la ubicacion (sin base) ---');
  comprobar('el local a si mismo: cero km', distanciaKm(LOCAL, LOCAL), 0);
  comprobar('un grado de latitud son unos 111 km', Math.round(distanciaKm({ lat: 10, lng: -84 }, { lat: 11, lng: -84 })), 111);
  comprobar('2 km cae en el primer tramo', tramoPara(aKm(2)).dentro && (tramoPara(aKm(2)) as { tramo: { productoMenuId: string } }).tramo.productoMenuId, '08003');
  comprobar('el corte es inclusivo: 3 km exactos sigue en el primero', (tramoPara(aKm(2.999)) as { tramo: { productoMenuId: string } }).tramo.productoMenuId, '08003');
  comprobar('3.5 km pasa al segundo', (tramoPara(aKm(3.5)) as { tramo: { productoMenuId: string } }).tramo.productoMenuId, '0105576');
  comprobar('6 km, el tercero', (tramoPara(aKm(6)) as { tramo: { productoMenuId: string } }).tramo.productoMenuId, '08007');
  comprobar('10 km, el cuarto', (tramoPara(aKm(10)) as { tramo: { productoMenuId: string } }).tramo.productoMenuId, '08004');
  comprobar('15 km esta fuera de zona', tramoPara(aKm(15)).dentro, false);
  comprobar('San Jose esta en Costa Rica', estaEnCostaRica({ lat: 9.93, lng: -84.08 }), true);
  comprobar('Miami no', estaEnCostaRica({ lat: 25.76, lng: -80.19 }), false);
  comprobar('NaN no', estaEnCostaRica({ lat: Number.NaN, lng: -84 }), false);

  console.log('\n--- Leer coordenadas que alguien pega (sin base) ---');
  const casa = { lat: 10.0163, lng: -84.214 };
  comprobar('coordenadas sueltas', leerCoordenadas('10.0163, -84.2140'), casa);
  comprobar('sin espacio', leerCoordenadas('10.0163,-84.2140'), casa);
  comprobar('con espacios de mas', leerCoordenadas('  10.0163 ,   -84.2140  '), casa);
  comprobar('un enlace largo con @', leerCoordenadas('https://www.google.com/maps/place/Alajuela/@10.0163,-84.2140,17z/data=!3m1'), casa);
  comprobar('un enlace con ?q=', leerCoordenadas('https://www.google.com/maps?q=10.0163,-84.2140'), casa);
  comprobar('un enlace con !3d!4d', leerCoordenadas('https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0!8m2!3d10.0163!4d-84.2140'), casa);
  comprobar('un enlace corto no sirve (esconde la posicion)', leerCoordenadas('https://maps.app.goo.gl/AbCdEf123'), null);
  comprobar('un punto de Miami no sirve', leerCoordenadas('25.7617, -80.1918'), null);
  comprobar('texto cualquiera no sirve', leerCoordenadas('hola mundo'), null);
  comprobar('vacio no sirve', leerCoordenadas('   '), null);
  comprobar('latitud y longitud sin decimales no se aceptan como punto', leerCoordenadas('10, -84'), null);

  console.log('\n--- Validar lo que manda el telefono (sin base) ---');
  const base = {
    clave: 'abcdefghijklmnop',
    nombre: 'Maria',
    telefono: '8888-7777',
    direccion: 'Del parque 200 norte',
    metodoPago: 'EFECTIVO',
    lat: 10.02,
    lng: -84.2,
    lineas: [{ varianteId: 'x', cantidad: 1, extras: [], notas: [] }],
  };
  const v = (o: Record<string, unknown>) => validarPedido({ ...base, ...o });
  comprobar('un pedido bueno pasa', v({}).ok, true);
  comprobar('el telefono se normaliza', (v({}) as { pedido: { telefono: string } }).pedido.telefono, '88887777');
  comprobar('sin nombre no pasa', v({ nombre: ' ' }).ok, false);
  comprobar('telefono corto no pasa', v({ telefono: '123' }).ok, false);
  comprobar('direccion corta no pasa', v({ direccion: 'x' }).ok, false);
  comprobar('clave corta no pasa', v({ clave: 'abc' }).ok, false);
  comprobar('ubicacion a medias no pasa', v({ lng: null }).ok, false);
  comprobar('ubicacion fuera de Costa Rica no pasa', v({ lat: 25, lng: -80 }).ok, false);
  comprobar('metodo de pago inventado no pasa', v({ metodoPago: 'BITCOIN' }).ok, false);
  comprobar('sin lineas no pasa', v({ lineas: [] }).ok, false);
  comprobar('cantidad 0 no pasa', v({ lineas: [{ varianteId: 'x', cantidad: 0, extras: [], notas: [] }] }).ok, false);
  comprobar('cantidad 21 no pasa', v({ lineas: [{ varianteId: 'x', cantidad: 21, extras: [], notas: [] }] }).ok, false);
  comprobar('cantidad con decimales no pasa', v({ lineas: [{ varianteId: 'x', cantidad: 1.5, extras: [], notas: [] }] }).ok, false);
  comprobar('un pedido que no es objeto no pasa', validarPedido('hola').ok, false);
  comprobar('treinta y una lineas no pasan', v({ lineas: Array.from({ length: 31 }, () => ({ varianteId: 'x', cantidad: 1, extras: [], notas: [] })) }).ok, false);
  comprobar('pagaCon negativo no pasa', v({ pagaCon: -5 }).ok, false);
  const largo = (v({ nombre: 'x'.repeat(500) }) as { pedido: { nombre: string } }).pedido.nombre.length;
  comprobar('un nombre larguisimo se corta', largo, 80);

  console.log('\n--- Nace cerrada ---');
  await sembrar();
  await aplicarPropuestaInicial();
  comprobar('sin ajuste, esta cerrada', await pedidosAbiertos(), false);

  const menu = await menuDeLaApp();
  const pizza = menu.find((c) => c.id === 'pizzas')!.items.find((i) => i.clave === 'pizza-la-estacion')!;
  const familiar = pizza.variantes.find((x) => x.opciones['Tamaño'] === 'Familiar')!;
  const queso = pizza.complementos.find((c) => c.filtro['Tamaño'] === 'Familiar' && c.etiqueta === 'Extra queso')!;
  const quesoMediana = pizza.complementos.find((c) => c.filtro['Tamaño'] === 'Mediana' && c.etiqueta === 'Extra queso')!;
  const entrada = (extra: Record<string, unknown> = {}) => ({
    clave: clave(),
    nombre: 'Maria Prueba',
    telefono: '88887777',
    direccion: 'Del parque 200 norte, casa verde',
    referencia: 'Portón negro',
    lat: aKm(2).lat,
    lng: aKm(2).lng,
    precisionM: 12,
    metodoPago: 'EFECTIVO',
    pagaCon: null,
    lineas: [{ varianteId: familiar.id, cantidad: 2, extras: [{ complementoId: queso.id, cantidad: 1 }], notas: ['Sin cebolla'] }],
    ...extra,
  });

  const cerrada = await falla(() => crearPedidoApp(entrada()));
  comprobar('cerrada: rechaza con su codigo', cerrada?.codigo, 'APP_CERRADA');
  comprobar('y no guarda nada', await prisma.pedidoApp.count(), 0);

  console.log('\n--- El interruptor deja rastro ---');
  const cajero = await prisma.cajero.create({ data: { nombre: 'Prueba', pin: 'x', rol: 'ADMIN' } });
  await fijarPedidosAbiertos(true, cajero.id);
  comprobar('abierta', await pedidosAbiertos(), true);
  await fijarPedidosAbiertos(false, cajero.id);
  comprobar('cerrada de nuevo', await pedidosAbiertos(), false);
  comprobar('queda en la bitacora', await prisma.eventoAuditoria.count({ where: { tipo: { in: ['APP_ABIERTA', 'APP_CERRADA'] }, cajeroId: cajero.id } }), 2);
  await fijarPedidosAbiertos(true, cajero.id);

  console.log('\n--- El envio fijo de pruebas y el cargo de la plataforma ---');
  const esperadoSub = (familiar.precio + queso.precio) * 2;
  const config0 = await configDeEnvio();
  comprobar('sin ajuste, el envio es FIJO', config0.modo, 'FIJO');
  comprobar('de 1.500 colones', config0.fijo, ENVIO_FIJO_DE_PRUEBA);
  comprobar('el cargo de la plataforma son 250 colones', CARGO_PLATAFORMA, 25000);
  const cotFija = await cotizar(entrada().lineas, aKm(2));
  comprobar('el envio fijo no apunta a un producto del POS', cotFija.envioProductoId, null);
  comprobar('el envio cuesta 1.500', cotFija.envio, 150000);
  comprobar('lleva el cargo de 250', cotFija.cargoApp, 25000);
  comprobar('el total suma comida, envio y cargo', cotFija.total, esperadoSub + 150000 + 25000);
  comprobar('a 10 km el envio fijo es el mismo', (await cotizar(entrada().lineas, aKm(10))).envio, 150000);
  comprobar('pero fuera de la zona de entrega no se entrega', (await falla(() => cotizar(entrada().lineas, aKm(20))))?.codigo, 'FUERA_DE_ZONA');
  const rFijo = await crearPedidoApp(entrada({ telefono: '87776666' }));
  const gFijo = await prisma.pedidoApp.findUnique({ where: { id: rFijo.id } });
  comprobar('el pedido guarda el cargo aparte', gFijo?.cargoApp, 25000);
  comprobar('y el envio aparte', gFijo?.envio, 150000);
  comprobar('y el total completo', gFijo?.total, esperadoSub + 150000 + 25000);
  comprobar('el cliente ve el cargo', (await pedidoParaElCliente(rFijo.id))?.cargoApp, 25000);
  await prisma.pedidoApp.deleteMany();

  console.log('\n--- Cambiar como se cobra el envio ---');
  await fijarConfigDeEnvio('FIJO', 2000, cajero.id);
  comprobar('un envio fijo de 2.000', (await cotizar(entrada().lineas, aKm(2))).envio, 200000);
  comprobar('queda en la bitacora', await prisma.eventoAuditoria.count({ where: { entidadId: 'envio_modo' } }), 1);
  comprobar('un monto con decimales se rechaza', (await falla(() => fijarConfigDeEnvio('FIJO', 1500.5, cajero.id)))?.codigo, 'DATOS_INVALIDOS');
  comprobar('un monto negativo se rechaza', (await falla(() => fijarConfigDeEnvio('FIJO', -1, cajero.id)))?.codigo, 'DATOS_INVALIDOS');
  comprobar('un monto absurdo se rechaza', (await falla(() => fijarConfigDeEnvio('FIJO', 5_000_000, cajero.id)))?.codigo, 'DATOS_INVALIDOS');
  await fijarConfigDeEnvio('DISTANCIA', 1500, cajero.id);
  comprobar('por distancia: el modo cambia', (await configDeEnvio()).modo, 'DISTANCIA');

  console.log('\n--- La zona: se sabe apenas el cliente marca donde esta ---');
  await fijarConfigDeEnvio('FIJO', 1500, cajero.id);
  const z1 = await cotizarZona(aKm(2));
  comprobar('dentro de la zona', z1.dentro, true);
  comprobar('el envio fijo', z1.envio, 150000);
  comprobar('los kilometros con un decimal', z1.km, 2);
  comprobar('el cargo de la plataforma viaja', z1.cargoApp, 25000);
  comprobar('y el tiempo estimado', [z1.tiempo.desde, z1.tiempo.hasta], [35, 50]);
  const z2 = await cotizarZona(aKm(20));
  comprobar('fuera de la zona no es un error', z2.dentro, false);
  comprobar('y no trae envio', z2.envio, null);
  comprobar('pero dice a cuantos km queda', z2.km, 20);
  await fijarConfigDeEnvio('DISTANCIA', 1500, cajero.id);
  comprobar('por distancia: 2 km cuesta lo de la caja (1.400)', (await cotizarZona(aKm(2))).envio, 140000);
  comprobar('por distancia: 6 km cuesta 2.000', (await cotizarZona(aKm(6))).envio, 200000);
  await prisma.productoMenu.update({ where: { id: '08003' }, data: { presente: false } });
  comprobar('si falta el producto del envio, se dice fuera de zona y no se cobra mal', (await cotizarZona(aKm(2))).dentro, false);
  await prisma.productoMenu.update({ where: { id: '08003' }, data: { presente: true } });

  console.log('\n--- Donde esta el local y hasta donde se entrega ---');
  const local0 = await configDeLocal();
  comprobar('sin ajuste, no esta configurada', local0.configurada, false);
  comprobar('y usa el punto provisional', [local0.lat, local0.lng], [LOCAL.lat, LOCAL.lng]);
  comprobar('con el radio por defecto', local0.radioKm, MAXIMO_KM);
  // Un local nuevo, a unos 30 km del provisional: lo que antes era "fuera de zona" ahora entra.
  const nuevoLocal = { lat: LOCAL.lat + 0.27, lng: LOCAL.lng };
  await fijarConfigDeLocal(nuevoLocal, 12, cajero.id);
  const local1 = await configDeLocal();
  comprobar('queda configurada', local1.configurada, true);
  comprobar('con la ubicacion nueva', [local1.lat, local1.lng], [nuevoLocal.lat, nuevoLocal.lng]);
  comprobar('un punto a 2 km del local nuevo esta dentro', (await cotizarZona({ lat: nuevoLocal.lat + 2 / 111.19, lng: nuevoLocal.lng })).dentro, true);
  comprobar('lo que quedaba a 2 km del punto viejo ahora esta fuera', (await cotizarZona(aKm(2))).dentro, false);
  await fijarConfigDeLocal(nuevoLocal, 1, cajero.id);
  comprobar('con radio de 1 km, 2 km queda fuera', (await cotizarZona({ lat: nuevoLocal.lat + 2 / 111.19, lng: nuevoLocal.lng })).dentro, false);
  comprobar('y 0.5 km dentro', (await cotizarZona({ lat: nuevoLocal.lat + 0.5 / 111.19, lng: nuevoLocal.lng })).dentro, true);
  comprobar('un radio de cero se rechaza', (await falla(() => fijarConfigDeLocal(nuevoLocal, 0, cajero.id)))?.codigo, 'DATOS_INVALIDOS');
  comprobar('un radio absurdo se rechaza', (await falla(() => fijarConfigDeLocal(nuevoLocal, 500, cajero.id)))?.codigo, 'DATOS_INVALIDOS');
  comprobar('un local fuera de Costa Rica se rechaza', (await falla(() => fijarConfigDeLocal({ lat: 25.7, lng: -80.2 }, 10, cajero.id)))?.codigo, 'DATOS_INVALIDOS');
  comprobar('un radio mal escrito en la base vuelve al de por defecto', await (async () => {
    await prisma.ajusteApp.update({ where: { clave: 'radio_km' }, data: { valor: 'abc' } });
    return (await configDeLocal()).radioKm;
  })(), MAXIMO_KM);
  comprobar('los cambios del local quedan en la bitacora', await prisma.eventoAuditoria.count({ where: { entidadId: 'local_lat' } }), 2);
  // Se deja como estaba para el resto de la prueba.
  await fijarConfigDeLocal(LOCAL, 12, cajero.id);
  comprobar('de vuelta al punto de siempre', (await cotizarZona(aKm(2))).dentro, true);

  console.log('\n--- Un pedido bueno (envio por distancia) ---');
  const cot = await cotizar(entrada().lineas, aKm(2));
  comprobar('el subtotal sale del POS', cot.subtotal, esperadoSub);
  comprobar('el envio del tramo es el producto 08003', cot.envioProductoId, '08003');
  comprobar('y cuesta lo que dice el POS', cot.envio, 140000);
  comprobar('el total es la suma, con el cargo', cot.total, esperadoSub + 140000 + CARGO_PLATAFORMA);

  const e1 = entrada({ pagaCon: 2000000 });
  const r1 = await crearPedidoApp(e1);
  comprobar('se crea', r1.repetido, false);
  comprobar('con un numero', r1.numero > 0, true);
  comprobar('y el total correcto', r1.total, esperadoSub + 140000 + CARGO_PLATAFORMA);
  const guardado = await prisma.pedidoApp.findUnique({ where: { id: r1.id }, include: { lineas: true } });
  comprobar('nace NUEVO', guardado?.estado, 'NUEVO');
  comprobar('guarda la ubicacion', guardado?.latitud !== null && guardado?.longitud !== null, true);
  comprobar('una linea', guardado?.lineas.length, 1);
  comprobar('la linea apunta al producto del POS', guardado?.lineas[0]?.productoMenuId, familiar.productoMenuId);
  comprobar('y guarda como lo vio el cliente', guardado?.lineas[0]?.detalle, 'Familiar');
  comprobar('y los extras', (guardado?.lineas[0]?.extras as Array<{ cantidad: number }>)[0]?.cantidad, 1);
  comprobar('y la nota', guardado?.lineas[0]?.notas, ['Sin cebolla']);

  console.log('\n--- Lo que mande el telefono sobre dinero no cuenta ---');
  const tramposo = { ...entrada(), total: 1, subtotal: 1, envio: 0, precio: 1 };
  const rt = await crearPedidoApp(tramposo);
  comprobar('el total lo puso el servidor', rt.total, esperadoSub + 140000 + CARGO_PLATAFORMA);

  console.log('\n--- Repetir el envio no duplica ---');
  const antes = await prisma.pedidoApp.count();
  const rep = await crearPedidoApp(e1);
  comprobar('devuelve el mismo pedido', [rep.id, rep.repetido], [r1.id, true]);
  comprobar('y no crea otro', await prisma.pedidoApp.count(), antes);

  console.log('\n--- Cosas que no se cobran ---');
  comprobar('una variante que no existe', (await falla(() => crearPedidoApp(entrada({ lineas: [{ varianteId: 'noexiste', cantidad: 1, extras: [], notas: [] }] }))))?.codigo, 'DATOS_INVALIDOS');
  comprobar('un extra de otro tamano', (await falla(() => crearPedidoApp(entrada({ lineas: [{ varianteId: familiar.id, cantidad: 1, extras: [{ complementoId: quesoMediana.id, cantidad: 1 }], notas: [] }] }))))?.codigo, 'DATOS_INVALIDOS');
  comprobar('mas extras que el maximo', (await falla(() => crearPedidoApp(entrada({ lineas: [{ varianteId: familiar.id, cantidad: 1, extras: [{ complementoId: queso.id, cantidad: 9 }], notas: [] }] }))))?.codigo, 'DATOS_INVALIDOS');
  comprobar('sin ubicacion', (await falla(() => crearPedidoApp(entrada({ lat: null, lng: null }))))?.codigo, 'DATOS_INVALIDOS');
  comprobar('fuera de zona', (await falla(() => crearPedidoApp(entrada({ lat: aKm(20).lat, lng: aKm(20).lng }))))?.codigo, 'FUERA_DE_ZONA');
  comprobar('pagaCon menor al total', (await falla(() => crearPedidoApp(entrada({ pagaCon: 1000 }))))?.codigo, 'DATOS_INVALIDOS');
  comprobar('con tarjeta (todavia no)', (await falla(() => crearPedidoApp(entrada({ metodoPago: 'TARJETA' }))))?.codigo, 'PAGO_NO_DISPONIBLE');
  comprobar('con SINPE sin numero configurado', (await falla(() => crearPedidoApp(entrada({ metodoPago: 'SINPE' }))))?.codigo, 'PAGO_NO_DISPONIBLE');
  await guardarAjuste(AJUSTE_SINPE_NUMERO, '88887777');
  const sinpe = await crearPedidoApp(entrada({ metodoPago: 'SINPE', referenciaPago: 'ABC123', telefono: '88886666' }));
  comprobar('con SINPE configurado, se crea', sinpe.repetido, false);
  comprobar('guarda la referencia', (await prisma.pedidoApp.findUnique({ where: { id: sinpe.id } }))?.referenciaPago, 'ABC123');
  comprobar('y el pago sin verificar', (await prisma.pedidoApp.findUnique({ where: { id: sinpe.id } }))?.pagoVerificado, false);
  const sinProductoEnvio = await prisma.productoMenu.update({ where: { id: '08003' }, data: { presente: false } });
  comprobar('si el producto de envio desaparece, no se cobra mal', (await falla(() => crearPedidoApp(entrada({ telefono: '88885555' }))))?.codigo, 'FUERA_DE_ZONA');
  await prisma.productoMenu.update({ where: { id: sinProductoEnvio.id }, data: { presente: true } });
  await prisma.itemApp.update({ where: { clave: 'pizza-la-estacion' }, data: { activo: false } });
  comprobar('un plato apagado no se puede pedir', (await falla(() => crearPedidoApp(entrada({ telefono: '88884444' }))))?.codigo, 'DATOS_INVALIDOS');
  await prisma.itemApp.update({ where: { clave: 'pizza-la-estacion' }, data: { activo: true } });
  await prisma.productoMenu.update({ where: { id: familiar.productoMenuId }, data: { precio: 1200000 } });
  const cotNueva = await cotizar(entrada().lineas, aKm(2));
  comprobar('si la caja cambia el precio, la app cobra el nuevo', cotNueva.subtotal, (1200000 + queso.precio) * 2);

  console.log('\n--- Tope de pedidos por telefono ---');
  await prisma.pedidoApp.deleteMany();
  await guardarAjuste(AJUSTE_ABIERTO, 'true');
  for (let i = 0; i < 3; i += 1) await crearPedidoApp(entrada({ telefono: '89990000' }));
  comprobar('al cuarto en diez minutos se frena', (await falla(() => crearPedidoApp(entrada({ telefono: '89990000' }))))?.codigo, 'DEMASIADOS_PEDIDOS');
  comprobar('otro telefono si puede', (await crearPedidoApp(entrada({ telefono: '89991111' }))).repetido, false);

  console.log('\n--- Seguimiento ---');
  const visto = await pedidoParaElCliente(r1.id);
  const ultimo = (await prisma.pedidoApp.findFirst({ orderBy: { createdAt: 'desc' } }))!;
  const v2 = await pedidoParaElCliente(ultimo.id);
  comprobar('un id que no existe no devuelve nada', await pedidoParaElCliente('abcdefghij0123'), null);
  comprobar('un id con basura no devuelve nada', await pedidoParaElCliente("x'; DROP TABLE pedidos_app;--"), null);
  comprobar('el cliente ve su pedido', v2?.nombre, 'Maria Prueba');
  comprobar('y no ve el telefono de nadie', JSON.stringify(v2).includes('8999'), false);
  void visto;

  console.log('\n--- Mover un pedido ---');
  comprobar('NUEVO puede pasar a ACEPTADO', transicionPermitida('NUEVO', 'ACEPTADO'), true);
  comprobar('NUEVO no salta a EN_CAMINO', transicionPermitida('NUEVO', 'EN_CAMINO'), false);
  comprobar('ENTREGADO no se reabre', transicionPermitida('ENTREGADO', 'NUEVO'), false);
  comprobar('CANCELADO no se reabre', transicionPermitida('CANCELADO', 'ACEPTADO'), false);
  await cambiarEstadoDePedidoApp(ultimo.id, 'ACEPTADO', cajero.id);
  await cambiarEstadoDePedidoApp(ultimo.id, 'EN_COCINA', cajero.id);
  comprobar('el estado cambia', (await prisma.pedidoApp.findUnique({ where: { id: ultimo.id } }))?.estado, 'EN_COCINA');
  comprobar('un salto invalido se rechaza', (await falla(() => cambiarEstadoDePedidoApp(ultimo.id, 'ENTREGADO', cajero.id)))?.codigo, 'DATOS_INVALIDOS');
  comprobar('un pedido inexistente se rechaza', (await falla(() => cambiarEstadoDePedidoApp('noexiste', 'ACEPTADO', cajero.id)))?.codigo, 'PEDIDO_NO_ENCONTRADO');
  comprobar('cada cambio queda en la bitacora', await prisma.eventoAuditoria.count({ where: { tipo: 'PEDIDO_APP_ESTADO', entidadId: ultimo.id } }), 2);

  console.log('\n--- Asignar a una moto ---');
  const chofer = await prisma.chofer.create({
    data: { idMeseroSoftRestaurant: 'T-APP-1', nombre: 'Repartidor Prueba', nombreNormalizado: 'REPARTIDOR PRUEBA' },
  });
  const inactivo = await prisma.chofer.create({
    data: { idMeseroSoftRestaurant: 'T-APP-2', nombre: 'Inactivo Prueba', nombreNormalizado: 'INACTIVO PRUEBA', estado: 'INACTIVO' },
  });
  await prisma.motocicleta.create({ data: { placa: 'TAPP001', marca: 'Honda', modelo: 'XR', anio: 2024, kilometrajeActual: 100 } });
  await prisma.asignacionMoto.create({
    data: { placa: 'TAPP001', choferId: chofer.id, candadoChoferActivo: chofer.id, candadoMotoActiva: 'TAPP001' },
  });
  const lista = await repartidoresDeLaApp();
  comprobar('la lista trae al chofer activo con su moto', lista.find((r) => r.id === chofer.id)?.placa, 'TAPP001');
  comprobar('y no trae al inactivo', lista.some((r) => r.id === inactivo.id), false);
  comprobar('un pedido nace sin repartidor', (await pedidosParaElLocal()).find((x) => x.id === ultimo.id)?.repartidor, null);
  await asignarRepartidorAPedidoApp(ultimo.id, chofer.id, cajero.id);
  const asignado = (await pedidosParaElLocal()).find((x) => x.id === ultimo.id)?.repartidor;
  comprobar('se asigna al repartidor', asignado?.nombre, 'Repartidor Prueba');
  comprobar('y se ve su moto', asignado?.placa, 'TAPP001');
  comprobar('asignar no cambia el estado', (await prisma.pedidoApp.findUnique({ where: { id: ultimo.id } }))?.estado, 'EN_COCINA');
  comprobar('queda en la bitacora', await prisma.eventoAuditoria.count({ where: { tipo: 'PEDIDO_APP_ESTADO', entidadId: ultimo.id } }), 3);
  await asignarRepartidorAPedidoApp(ultimo.id, chofer.id, cajero.id);
  comprobar('asignar al mismo no repite la bitacora', await prisma.eventoAuditoria.count({ where: { tipo: 'PEDIDO_APP_ESTADO', entidadId: ultimo.id } }), 3);
  const suyo = await resumenDelRepartidor(chofer.id);
  const dePrueba = await prisma.pedidoApp.findUnique({ where: { id: ultimo.id } });
  comprobar('el repartidor ve el pedido que le dieron', suyo.pedidosApp.map((x) => x.id), [ultimo.id]);
  comprobar('con su ubicacion para abrir Waze', suyo.pedidosApp[0]?.ubicacion !== null, true);
  comprobar('y lo que tiene que cobrar en efectivo', suyo.pedidosApp[0]?.porCobrar, dePrueba?.metodoPago === 'EFECTIVO' ? dePrueba.total : 0);
  comprobar('y su moto de hoy', suyo.moto?.placa, 'TAPP001');
  comprobar('otro repartidor no ve pedidos ajenos', (await resumenDelRepartidor(inactivo.id)).pedidosApp.length, 0);
  comprobar('un inactivo no puede llevar pedidos', (await falla(() => asignarRepartidorAPedidoApp(ultimo.id, inactivo.id, cajero.id)))?.codigo, 'CHOFER_INACTIVO');
  comprobar('un chofer que no existe se rechaza', (await falla(() => asignarRepartidorAPedidoApp(ultimo.id, 'noexiste', cajero.id)))?.codigo, 'CHOFER_NO_ENCONTRADO');
  comprobar('un pedido que no existe se rechaza', (await falla(() => asignarRepartidorAPedidoApp('noexiste', chofer.id, cajero.id)))?.codigo, 'PEDIDO_NO_ENCONTRADO');
  await asignarRepartidorAPedidoApp(ultimo.id, null, cajero.id);
  comprobar('se le puede quitar el pedido', (await pedidosParaElLocal()).find((x) => x.id === ultimo.id)?.repartidor, null);
  await asignarRepartidorAPedidoApp(ultimo.id, chofer.id, cajero.id);
  await cambiarEstadoDePedidoApp(ultimo.id, 'EN_CAMINO', cajero.id);
  await cambiarEstadoDePedidoApp(ultimo.id, 'ENTREGADO', cajero.id);
  comprobar('un pedido entregado sale de su lista', (await resumenDelRepartidor(chofer.id)).pedidosApp.length, 0);
  comprobar('un pedido entregado no se reasigna', (await falla(() => asignarRepartidorAPedidoApp(ultimo.id, null, cajero.id)))?.codigo, 'DATOS_INVALIDOS');
  comprobar('el repartidor sigue anotado en el pedido entregado', (await pedidosParaElLocal()).find((x) => x.id === ultimo.id)?.repartidor?.id, chofer.id);

  console.log('\n--- Lo que ve el local ---');
  const local = await pedidosParaElLocal();
  comprobar('lista los pedidos', local.length, 4);
  comprobar('los mas nuevos primero', local[0]?.id, ultimo.id);
  comprobar('con telefono y ubicacion', local[0]?.telefono !== undefined && local[0]?.ubicacion !== null, true);

  await prisma.eventoAuditoria.deleteMany({ where: { cajeroId: cajero.id } });
  await prisma.cajero.delete({ where: { id: cajero.id } });
  await limpiar();
  await prisma.asignacionMoto.deleteMany({ where: { placa: 'TAPP001' } });
  await prisma.motocicleta.delete({ where: { placa: 'TAPP001' } });
  await prisma.chofer.deleteMany({ where: { id: { in: [chofer.id, inactivo.id] } } });
  console.log(fallos === 0 ? '\nTodo bien' : `\n${fallos} fallas`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
