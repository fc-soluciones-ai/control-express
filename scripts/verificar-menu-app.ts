/**
 * Comprobacion del menu estructurado de la app.
 *
 *   npm run test:menu-app
 *
 * Lo que se prueba:
 *  - que la propuesta inicial carga completa y de una vez, y que repetirla no
 *    duplica nada;
 *  - que lo que el dueno ya cambio no se pisa;
 *  - que el precio sale del producto del POS (si la caja lo cambia, la app lo ve);
 *  - que un producto retirado, bloqueado u oculto desaparece de lo que ve el
 *    cliente, y que un plato sin ninguna variante ofrecible no aparece;
 *  - que un producto que la propuesta menciona y el POS no tiene se avisa, no
 *    rompe.
 *
 * Escribe y borra filas: corre contra la base de PRUEBAS.
 */

import { prisma } from '@/lib/db/prisma';
import { ejesDe, precioDeUnidad, varianteElegida } from '@/lib/menu/estructura';
import { PROPUESTA_INICIAL } from '@/lib/menu/propuesta-inicial';
import { aplicarPropuestaInicial, menuDeLaApp } from '@/server/services/menu-app';

import { exigirBaseDePruebas } from './guarda-pruebas';

let fallos = 0;

function comprobar(que: string, real: unknown, esperado: unknown): void {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos += 1;
  console.log(
    `${bien ? 'OK  ' : 'MAL '} ${que}${bien ? '' : `  (${JSON.stringify(real)} != ${JSON.stringify(esperado)})`}`,
  );
}

async function limpiar(): Promise<void> {
  await prisma.lineaPedidoApp.deleteMany();
  await prisma.pedidoApp.deleteMany();
  await prisma.complementoApp.deleteMany();
  await prisma.varianteApp.deleteMany();
  await prisma.itemApp.deleteMany();
  await prisma.categoriaApp.deleteMany();
  await prisma.productoMenu.deleteMany();
  await prisma.grupoMenu.deleteMany();
}

/** Un producto del POS por cada id que la propuesta menciona, con precio parejo. */
async function sembrarProductos(sin: string[] = []): Promise<string[]> {
  const ids = new Set<string>();
  for (const c of PROPUESTA_INICIAL) {
    for (const i of c.items) {
      for (const v of i.variantes) ids.add(v.producto);
      for (const x of i.complementos ?? []) ids.add(x.producto);
    }
  }
  const lista = [...ids].filter((id) => !sin.includes(id));
  await prisma.grupoMenu.create({ data: { id: '01', nombre: 'GRUPO', clasificacion: 2 } });
  await prisma.productoMenu.createMany({
    data: lista.map((id, n) => ({
      id,
      nombre: `PRODUCTO ${id}`,
      grupoId: '01',
      areaId: '01',
      precio: 100000 + n * 100,
      paraDomicilio: true,
    })),
  });
  return lista;
}

async function main(): Promise<void> {
  exigirBaseDePruebas();
  await limpiar();

  console.log('\n--- La propuesta es coherente por si sola ---');
  const claves = PROPUESTA_INICIAL.flatMap((c) => c.items.map((i) => i.clave));
  comprobar('no hay dos platos con la misma clave', new Set(claves).size, claves.length);
  const repetidas: string[] = [];
  for (const c of PROPUESTA_INICIAL) {
    for (const i of c.items) {
      const vistas = new Set<string>();
      for (const v of i.variantes) {
        const k = JSON.stringify(v.opciones);
        if (vistas.has(k)) repetidas.push(`${i.clave} ${k}`);
        vistas.add(k);
      }
      const prods = new Set(i.variantes.map((v) => v.producto));
      if (prods.size !== i.variantes.length) repetidas.push(`${i.clave} producto repetido`);
    }
  }
  comprobar('ningun plato repite una combinacion ni un producto', repetidas, []);
  const sinEjesParejos = PROPUESTA_INICIAL.flatMap((c) => c.items).filter((i) => {
    const claves0 = Object.keys(i.variantes[0]!.opciones).sort().join('|');
    return i.variantes.some((v) => Object.keys(v.opciones).sort().join('|') !== claves0);
  });
  comprobar('todas las variantes de un plato deciden las mismas cosas', sinEjesParejos.map((i) => i.clave), []);

  console.log('\n--- Cargar la propuesta ---');
  const lista = await sembrarProductos();
  const r1 = await aplicarPropuestaInicial();
  comprobar('cinco categorias', r1.categorias, 5);
  comprobar('un plato por cada clave', r1.items, claves.length);
  comprobar('ningun producto faltante', r1.faltantes, []);
  const totalVariantes = PROPUESTA_INICIAL.flatMap((c) => c.items).reduce((n, i) => n + i.variantes.length, 0);
  comprobar('todas las variantes', r1.variantes, totalVariantes);
  comprobar('las variantes quedan en la base', await prisma.varianteApp.count(), totalVariantes);
  comprobar('hay extras de pizza', (await prisma.complementoApp.count()) > 100, true);

  console.log('\n--- Repetirla no duplica nada ---');
  const r2 = await aplicarPropuestaInicial();
  comprobar('nada nuevo', [r2.categorias, r2.items, r2.variantes, r2.complementos], [0, 0, 0, 0]);
  comprobar('la cantidad de platos no cambia', await prisma.itemApp.count(), claves.length);

  console.log('\n--- Lo que ve el cliente ---');
  const menu = await menuDeLaApp();
  comprobar(
    'las categorias salen en orden',
    menu.map((c) => c.id),
    ['pizzas', 'pollo', 'parrilla', 'hamburguesas', 'combos'],
  );
  const pizzas = menu.find((c) => c.id === 'pizzas')!;
  comprobar('14 sabores de pizza', pizzas.items.length, 14);
  const estacion = pizzas.items.find((i) => i.clave === 'pizza-la-estacion')!;
  comprobar('la pizza decide solo el tamano', ejesDe(estacion.variantes, estacion.ejes), [
    { nombre: 'Tamaño', valores: ['Personal', 'Mediana', 'Familiar'] },
  ]);
  const solo = pizzas.items.find((i) => i.clave === 'pizza-solo-pollo')!;
  comprobar('Solo pollo no existe en personal', ejesDe(solo.variantes, solo.ejes)[0]!.valores, ['Mediana', 'Familiar']);

  const familiar = varianteElegida(estacion.variantes, { Tamaño: 'Familiar' })!;
  comprobar('el precio sale del producto del POS', familiar.precio, (await prisma.productoMenu.findUnique({ where: { id: '01012' } }))!.precio);
  const extraQueso = estacion.complementos.find((c) => c.filtro['Tamaño'] === 'Familiar' && c.etiqueta === 'Extra queso')!;
  comprobar('el extra de queso de la familiar es el producto 01048', extraQueso.productoMenuId, '01048');
  comprobar(
    'una familiar con dos quesos',
    precioDeUnidad(familiar, estacion.complementos, [{ complementoId: extraQueso.id, cantidad: 2 }]),
    familiar.precio + 2 * extraQueso.precio,
  );
  comprobar('"desde" es la personal', estacion.desde, Math.min(...estacion.variantes.map((v) => v.precio)));

  const tres = menu.find((c) => c.id === 'pollo')!.items.find((i) => i.clave === 'tres-piezas')!;
  comprobar('tres piezas decide dos cosas', ejesDe(tres.variantes, tres.ejes).map((e) => e.nombre), ['Piezas', 'Papas']);
  comprobar('y tiene ocho combinaciones', tres.variantes.length, 8);

  console.log('\n--- La caja cambia un precio ---');
  await prisma.productoMenu.update({ where: { id: '01012' }, data: { precio: 1100000 } });
  const despues = (await menuDeLaApp()).find((c) => c.id === 'pizzas')!.items.find((i) => i.clave === 'pizza-la-estacion')!;
  comprobar('la app ve el precio nuevo', varianteElegida(despues.variantes, { Tamaño: 'Familiar' })!.precio, 1100000);

  console.log('\n--- Retirar, bloquear y ocultar ---');
  await prisma.productoMenu.update({ where: { id: '01012' }, data: { bloqueado: true } });
  const sinFamiliar = (await menuDeLaApp()).find((c) => c.id === 'pizzas')!.items.find((i) => i.clave === 'pizza-la-estacion')!;
  comprobar('un producto bloqueado deja de ofrecerse', ejesDe(sinFamiliar.variantes, sinFamiliar.ejes)[0]!.valores, ['Personal', 'Mediana']);
  await prisma.productoMenu.update({ where: { id: '01012' }, data: { bloqueado: false } });

  await prisma.productoMenu.update({ where: { id: '01048' }, data: { presente: false } });
  const sinExtra = (await menuDeLaApp()).find((c) => c.id === 'pizzas')!.items.find((i) => i.clave === 'pizza-la-estacion')!;
  comprobar('un extra retirado del POS no se ofrece', sinExtra.complementos.some((c) => c.productoMenuId === '01048'), false);
  await prisma.productoMenu.update({ where: { id: '01048' }, data: { presente: true } });

  await prisma.productoMenu.update({ where: { id: '04062' }, data: { ocultoPorDueno: true } });
  const parrilla = (await menuDeLaApp()).find((c) => c.id === 'parrilla')!;
  comprobar('un plato cuyo unico producto esta oculto no aparece', parrilla.items.map((i) => i.clave), ['pechuga-plancha']);
  await prisma.productoMenu.update({ where: { id: '04062' }, data: { ocultoPorDueno: false } });
  await prisma.productoMenu.update({ where: { id: '04060' }, data: { bloqueado: true } });
  await prisma.productoMenu.update({ where: { id: '04062' }, data: { bloqueado: true } });
  comprobar('una categoria sin platos ofrecibles no aparece', (await menuDeLaApp()).some((c) => c.id === 'parrilla'), false);
  await prisma.productoMenu.updateMany({ where: { id: { in: ['04060', '04062'] } }, data: { bloqueado: false } });

  console.log('\n--- Lo que el dueno cambio no se pisa ---');
  await prisma.itemApp.update({ where: { clave: 'pizza-la-estacion' }, data: { nombre: 'La Pizza de la Casa', activo: false, orden: 999 } });
  await prisma.categoriaApp.update({ where: { id: 'pizzas' }, data: { nombre: 'Nuestras Pizzas' } });
  await aplicarPropuestaInicial();
  const editado = await prisma.itemApp.findUnique({ where: { clave: 'pizza-la-estacion' } });
  comprobar('el nombre que puso el dueno se queda', editado?.nombre, 'La Pizza de la Casa');
  comprobar('sigue apagado', editado?.activo, false);
  comprobar('y con su orden', editado?.orden, 999);
  comprobar('la categoria renombrada se queda', (await prisma.categoriaApp.findUnique({ where: { id: 'pizzas' } }))?.nombre, 'Nuestras Pizzas');
  const apagado = (await menuDeLaApp()).find((c) => c.id === 'pizzas')!;
  comprobar('un plato apagado no se ve', apagado.items.some((i) => i.clave === 'pizza-la-estacion'), false);

  console.log('\n--- Un producto que el POS no tiene ---');
  await limpiar();
  await sembrarProductos(['01048', '04062']);
  const r3 = await aplicarPropuestaInicial();
  comprobar('se avisa cuales faltan', r3.faltantes, ['01048', '04062']);
  const menu3 = await menuDeLaApp();
  comprobar('la costilla, sin su producto, no se crea', menu3.find((c) => c.id === 'parrilla')?.items.map((i) => i.clave), ['pechuga-plancha']);
  const est3 = menu3.find((c) => c.id === 'pizzas')!.items.find((i) => i.clave === 'pizza-la-estacion')!;
  comprobar('la pizza se crea sin ese extra', est3.complementos.some((c) => c.productoMenuId === '01048'), false);
  // Cuando el producto aparece, un segundo pase lo completa.
  await prisma.productoMenu.createMany({ data: [
    { id: '01048', nombre: 'EXTRA FAM QUESO', grupoId: '01', areaId: '01', precio: 80000, paraDomicilio: true },
    { id: '04062', nombre: 'COSTILLA CERDO', grupoId: '01', areaId: '03', precio: 650000, paraDomicilio: true },
  ] });
  const r4 = await aplicarPropuestaInicial();
  comprobar('el segundo pase completa lo que faltaba', [r4.faltantes.length, r4.items >= 1], [0, true]);

  await limpiar();
  void lista;
  console.log(fallos === 0 ? '\nTodo bien' : `\n${fallos} fallas`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
