/**
 * Comprobacion del menu que el agente copia del POS.
 *
 *   npm run test:menu
 *
 * Lo que se prueba es lo que protege al cliente y a la caja:
 *  - que el precio de la app sea EXACTAMENTE el de la caja (el POS guarda cosas
 *    como 9950.0001 y 2999.9999 que son 9,950 y 3,000);
 *  - que un producto de comedor, bloqueado, sin precio fijo o de un grupo de
 *    cargos nunca se ofrezca;
 *  - que repetir el envio no cambie nada, y que lo que el dueno oculto siga
 *    oculto aunque el POS mande el producto otra vez;
 *  - que un producto que desaparece del POS deje de ofrecerse sin borrarse.
 *
 * Escribe y borra filas: corre contra la base de PRUEBAS.
 */

import { createHmac } from 'node:crypto';

import { prisma } from '@/lib/db/prisma';
import { esOfrecible } from '@/lib/menu/reglas';
import { menuParaLaApp, sincronizarMenu, type EnvioDeMenu } from '@/server/services/menu';

import { exigirBaseDePruebas } from './guarda-pruebas';

let fallos = 0;

function comprobar(que: string, real: unknown, esperado: unknown): void {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos += 1;
  console.log(
    `${bien ? 'OK  ' : 'MAL '} ${que}${bien ? '' : `  (${JSON.stringify(real)} != ${JSON.stringify(esperado)})`}`,
  );
}

function envioBase(): EnvioDeMenu {
  return {
    completo: true,
    grupos: [
      { clave: '01', nombre: 'FAMILIAR', clasificacion: 2 },
      { clave: '06', nombre: 'REFRESCOS', clasificacion: 1 },
      { clave: '08', nombre: 'EXPRESS', clasificacion: 3 },
    ],
    productos: [
      // La pizza de domicilio: el POS la guarda como 9950.0001.
      { clave: '01004', nombre: 'PIZZA FAMILIAR ESTA POLLO', grupo: '01', area: '01', precio: 9950.0001, impuesto: 13, paraDomicilio: true },
      // La misma pizza para comedor: no se ofrece.
      { clave: '01003', nombre: 'PIZZA FAMILIAR ESTA POLLO', grupo: '01', area: '01', precio: 9508.5368, impuesto: 13, paraDomicilio: false },
      // Un refresco sin area de cocina.
      { clave: '06078', nombre: 'COCA COLA 600 ML', grupo: '06', area: null, precio: 1299.9999, impuesto: 13, paraDomicilio: true },
      // Bloqueado.
      { clave: '06999', nombre: 'BLOQUEADO', grupo: '06', precio: 1000, paraDomicilio: true, bloqueado: true },
      // Con la marca de precio abierto, como viene en TODO el POS: igual se ofrece.
      { clave: '06998', nombre: 'CON MARCA DE PRECIO ABIERTO', grupo: '06', precio: 500, paraDomicilio: true, precioAbierto: true },
      // Cargo de envio: grupo fuera del menu.
      { clave: '0105576', nombre: 'EXPRESS 1600', grupo: '08', precio: 1600, paraDomicilio: true },
      // Sin precio.
      { clave: '06997', nombre: 'GRATIS', grupo: '06', precio: 0, paraDomicilio: true },
    ],
  };
}

async function limpiar(): Promise<void> {
  // Primero lo que depende de los productos (el menu de la app), si otra prueba lo dejo.
  await prisma.lineaPedidoApp.deleteMany();
  await prisma.pedidoApp.deleteMany();
  await prisma.complementoApp.deleteMany();
  await prisma.varianteApp.deleteMany();
  await prisma.itemApp.deleteMany();
  await prisma.categoriaApp.deleteMany();
  await prisma.productoMenu.deleteMany();
  await prisma.grupoMenu.deleteMany();
}

async function main(): Promise<void> {
  exigirBaseDePruebas();

  console.log('\n--- La regla de lo que se ofrece ---');
  const bueno = {
    presente: true,
    paraDomicilio: true,
    bloqueado: false,
    ocultoPorDueno: false,
    precioAbierto: false,
    precio: 100,
    grupoId: '01' as string | null,
  };
  comprobar('un producto normal se ofrece', esOfrecible(bueno), true);
  comprobar('de comedor no', esOfrecible({ ...bueno, paraDomicilio: false }), false);
  comprobar('bloqueado no', esOfrecible({ ...bueno, bloqueado: true }), false);
  comprobar('oculto por el dueno no', esOfrecible({ ...bueno, ocultoPorDueno: true }), false);
  comprobar('precio abierto NO decide (vale distinto de cero en todo el POS)', esOfrecible({ ...bueno, precioAbierto: true }), true);
  comprobar('sin precio no', esOfrecible({ ...bueno, precio: 0 }), false);
  comprobar('retirado del POS no', esOfrecible({ ...bueno, presente: false }), false);
  comprobar('grupo de cargos (08) no', esOfrecible({ ...bueno, grupoId: '08' }), false);
  comprobar('sin grupo si se ofrece', esOfrecible({ ...bueno, grupoId: null }), true);

  console.log('\n--- Primer envio ---');
  await limpiar();
  const r1 = await sincronizarMenu(envioBase());
  comprobar('7 productos nuevos', r1.nuevos, 7);
  comprobar('3 grupos', r1.grupos, 3);
  comprobar('ningun rechazado', r1.rechazados.length, 0);

  const pizza = await prisma.productoMenu.findUnique({ where: { id: '01004' } });
  comprobar('9950.0001 queda en 995000 centimos', pizza?.precio, 995000);
  const coca = await prisma.productoMenu.findUnique({ where: { id: '06078' } });
  comprobar('1299.9999 queda en 130000 centimos', coca?.precio, 130000);
  comprobar('la clave conserva los ceros de adelante', (await prisma.productoMenu.findUnique({ where: { id: '0105576' } }))?.id, '0105576');
  comprobar('el area queda', pizza?.areaId, '01');
  comprobar('un refresco no tiene area', coca?.areaId, null);

  const menu = await menuParaLaApp();
  const ids = menu.flatMap((g) => g.productos.map((p) => p.id));
  comprobar('el menu ofrece la pizza de domicilio, la coca y la que trae marca de precio abierto', ids.sort(), ['01004', '06078', '06998']);
  comprobar('agrupado en dos grupos', menu.map((g) => g.id), ['01', '06']);
  comprobar('el grupo trae su nombre', menu[0]?.nombre, 'FAMILIAR');

  console.log('\n--- Repetir el envio no cambia nada ---');
  const r2 = await sincronizarMenu(envioBase());
  comprobar('nada nuevo', r2.nuevos, 0);
  comprobar('nada actualizado', r2.actualizados, 0);
  comprobar('siete sin cambio', r2.sinCambio, 7);
  comprobar('nada retirado', r2.retirados, 0);

  console.log('\n--- La caja cambia un precio ---');
  const cambiado = envioBase();
  cambiado.productos[0]!.precio = 10500;
  const r3 = await sincronizarMenu(cambiado);
  comprobar('un producto actualizado', r3.actualizados, 1);
  comprobar('el precio nuevo se ve', (await prisma.productoMenu.findUnique({ where: { id: '01004' } }))?.precio, 1050000);

  console.log('\n--- Lo que el dueno oculto sigue oculto ---');
  await prisma.productoMenu.update({ where: { id: '06078' }, data: { ocultoPorDueno: true } });
  await sincronizarMenu(envioBase());
  comprobar(
    'el POS lo vuelve a mandar y sigue oculto',
    (await prisma.productoMenu.findUnique({ where: { id: '06078' } }))?.ocultoPorDueno,
    true,
  );
  comprobar('y no sale en el menu', (await menuParaLaApp()).flatMap((g) => g.productos.map((p) => p.id)), ['01004', '06998']);
  await prisma.productoMenu.update({ where: { id: '06078' }, data: { ocultoPorDueno: false } });

  console.log('\n--- Un producto desaparece del POS ---');
  const sinCoca = envioBase();
  sinCoca.productos = sinCoca.productos.filter((p) => p.clave !== '06078');
  const r4 = await sincronizarMenu(sinCoca);
  comprobar('uno retirado', r4.retirados, 1);
  const retirada = await prisma.productoMenu.findUnique({ where: { id: '06078' } });
  comprobar('sigue guardado (los pedidos viejos lo mencionan)', retirada !== null, true);
  comprobar('pero ya no esta presente', retirada?.presente, false);
  comprobar('y no se ofrece', (await menuParaLaApp()).flatMap((g) => g.productos.map((p) => p.id)), ['01004', '06998']);
  // Si vuelve, se recupera.
  await sincronizarMenu(envioBase());
  comprobar('si vuelve al POS, se recupera', (await prisma.productoMenu.findUnique({ where: { id: '06078' } }))?.presente, true);

  console.log('\n--- Un pedazo no retira nada ---');
  const pedazo = envioBase();
  pedazo.completo = false;
  pedazo.productos = pedazo.productos.slice(0, 1);
  const r5 = await sincronizarMenu(pedazo);
  comprobar('un envio parcial no retira', r5.retirados, 0);

  console.log('\n--- Datos malos no tumban el envio ---');
  const malo: EnvioDeMenu = {
    completo: false,
    grupos: [{ clave: '' }, { clave: '01', nombre: 'FAMILIAR', clasificacion: 9 }],
    productos: [
      { clave: '', nombre: 'sin clave', precio: 100 },
      { clave: 'X1', nombre: 'precio negativo', precio: -5 },
      { clave: 'X2', nombre: 'sin precio' },
      { clave: 'X3', nombre: 'grupo inexistente', grupo: 'ZZ', precio: 100, paraDomicilio: true },
      { clave: 'a'.repeat(31), nombre: 'clave larguisima', precio: 100 },
    ],
  };
  const r6 = await sincronizarMenu(malo);
  comprobar('cinco rechazos con motivo (un grupo y cuatro productos)', r6.rechazados.length, 5);
  comprobar('el de grupo inexistente se guarda sin grupo', (await prisma.productoMenu.findUnique({ where: { id: 'X3' } }))?.grupoId, null);
  comprobar('una clasificacion invalida queda en 3', (await prisma.grupoMenu.findUnique({ where: { id: '01' } }))?.clasificacion, 3);

  let rechazoLimite = false;
  try {
    await sincronizarMenu({ grupos: [], productos: Array.from({ length: 3001 }, (_, i) => ({ clave: String(i), precio: 1 })) });
  } catch {
    rechazoLimite = true;
  }
  comprobar('un lote gigante se rechaza entero', rechazoLimite, true);

  let rechazoForma = false;
  try {
    await sincronizarMenu({} as EnvioDeMenu);
  } catch {
    rechazoForma = true;
  }
  comprobar('un envio sin listas se rechaza', rechazoForma, true);

  console.log('\n--- La ruta, con y sin firma ---');
  await limpiar();
  process.env.POS_AGENTE_SECRETO = 'secreto-de-prueba';
  const { POST } = await import('@/app/api/pos/menu/route');
  const cuerpo = JSON.stringify(envioBase());
  const hora = String(Math.floor(Date.now() / 1000));
  const firma = createHmac('sha256', 'secreto-de-prueba').update(`${hora}.${cuerpo}`, 'utf8').digest('hex');
  const llamar = (cabeceras: Record<string, string>, texto: string) =>
    POST(new Request('http://localhost/api/pos/menu', { method: 'POST', headers: cabeceras, body: texto }));

  const sinFirma = await llamar({}, cuerpo);
  comprobar('sin firma responde 401', sinFirma.status, 401);
  comprobar('y no guarda nada', await prisma.productoMenu.count(), 0);

  const firmaMala = await llamar({ 'x-agente-firma': 'aa'.repeat(32), 'x-agente-hora': hora }, cuerpo);
  comprobar('con firma falsa responde 401', firmaMala.status, 401);

  const otroCuerpo = await llamar({ 'x-agente-firma': firma, 'x-agente-hora': hora }, cuerpo.replace('9950.0001', '1'));
  comprobar('con el cuerpo cambiado despues de firmar responde 401', otroCuerpo.status, 401);

  const buena = await llamar({ 'x-agente-firma': firma, 'x-agente-hora': hora }, cuerpo);
  comprobar('con firma buena responde 200', buena.status, 200);
  const dato = (await buena.json()) as { nuevos: number };
  comprobar('y guarda los siete productos', dato.nuevos, 7);

  const roto = '{no es json';
  const firmaRota = createHmac('sha256', 'secreto-de-prueba').update(`${hora}.${roto}`, 'utf8').digest('hex');
  const resRoto = await llamar({ 'x-agente-firma': firmaRota, 'x-agente-hora': hora }, roto);
  comprobar('un cuerpo firmado pero que no es JSON responde 400', resRoto.status, 400);

  await limpiar();
  console.log(fallos === 0 ? '\nTodo bien' : `\n${fallos} fallas`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
