/**
 * Comprobacion de la logica del menu de la app (sin base de datos).
 *
 *   npm run test:estructura
 *
 * De aqui depende que el cliente no pueda pedir una combinacion que no existe y
 * que el precio que se le cobra sea el de la caja.
 */

import {
  agregarLinea,
  cambiarCantidad,
  crearLinea,
  leerCarritoGuardado,
  limpiarNota,
  totalDelCarrito,
  unidadesDelCarrito,
  MAXIMO_POR_LINEA,
} from '@/lib/menu/carrito';
import {
  complementosDe,
  ejesDe,
  precioDeUnidad,
  precioDesde,
  valoresPosibles,
  varianteElegida,
  type ComplementoVista,
  type VarianteVista,
} from '@/lib/menu/estructura';

let fallos = 0;

function comprobar(que: string, real: unknown, esperado: unknown): void {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos += 1;
  console.log(
    `${bien ? 'OK  ' : 'MAL '} ${que}${bien ? '' : `  (${JSON.stringify(real)} != ${JSON.stringify(esperado)})`}`,
  );
}

const v = (id: string, opciones: Record<string, string>, precio: number): VarianteVista => ({
  id,
  opciones,
  precio,
  productoMenuId: `P${id}`,
});

// Una pizza que existe en dos tamanos, pero no en el tercero.
const pizza: VarianteVista[] = [
  v('a', { Tamano: 'Personal' }, 325000),
  v('b', { Tamano: 'Mediana' }, 795000),
  v('c', { Tamano: 'Familiar' }, 995000),
];

// Tres piezas: 2 decisiones.
const tres: VarianteVista[] = [
  v('1', { Piezas: '2 cuartos y 1 muslo', Papas: 'Normales' }, 400000),
  v('2', { Piezas: '2 cuartos y 1 muslo', Papas: 'Agrandadas' }, 445000),
  v('3', { Piezas: 'Pechuga y cuarto', Papas: 'Normales' }, 400000),
  v('4', { Piezas: 'Pechuga y cuarto', Papas: 'Agrandadas' }, 445000),
];

// Un sabor que solo existe en dos tamanos.
const soloPollo: VarianteVista[] = [
  v('m', { Tamano: 'Mediana' }, 750000),
  v('f', { Tamano: 'Familiar' }, 950000),
];

const extras: ComplementoVista[] = [
  { id: 'qf', etiqueta: 'Extra queso', precio: 80000, filtro: { Tamano: 'Familiar' }, maximo: 3, productoMenuId: 'EQF' },
  { id: 'qm', etiqueta: 'Extra queso', precio: 50000, filtro: { Tamano: 'Mediana' }, maximo: 3, productoMenuId: 'EQM' },
  { id: 'sal', etiqueta: 'Salsa', precio: 20000, filtro: {}, maximo: 2, productoMenuId: 'SAL' },
];

console.log('\n--- Las decisiones de un plato ---');
comprobar('una pizza tiene una decision: el tamano', ejesDe(pizza), [
  { nombre: 'Tamano', valores: ['Personal', 'Mediana', 'Familiar'] },
]);
comprobar('tres piezas tiene dos, en el orden en que se cargaron', ejesDe(tres).map((e) => e.nombre), ['Piezas', 'Papas']);
comprobar('el orden explicito manda sobre el de las claves', ejesDe(tres, ['Papas', 'Piezas']).map((e) => e.nombre), ['Papas', 'Piezas']);
comprobar('lo que el orden no menciona va al final', ejesDe(tres, ['Papas']).map((e) => e.nombre), ['Papas', 'Piezas']);
comprobar('un eje que el orden menciona y no existe se ignora', ejesDe(pizza, ['Fantasma', 'Tamano']).map((e) => e.nombre), ['Tamano']);
comprobar('sin variantes no hay decisiones', ejesDe([]), []);
comprobar('un plato sin decisiones tiene un eje vacio', ejesDe([v('x', {}, 100)]), []);

console.log('\n--- Solo se ofrece lo que existe ---');
comprobar('de entrada, todos los tamanos', valoresPosibles(soloPollo, 'Tamano', {}), ['Mediana', 'Familiar']);
comprobar(
  'tras elegir piezas, solo las papas de esas piezas',
  valoresPosibles(tres, 'Papas', { Piezas: 'Pechuga y cuarto' }),
  ['Normales', 'Agrandadas'],
);

console.log('\n--- La variante exacta ---');
comprobar('con todo decidido hay una', varianteElegida(pizza, { Tamano: 'Familiar' })?.id, 'c');
comprobar('si falta decidir, no hay ninguna', varianteElegida(tres, { Piezas: 'Pechuga y cuarto' }), null);
comprobar('combinacion que no existe, no hay ninguna', varianteElegida(soloPollo, { Tamano: 'Personal' }), null);
comprobar(
  'dos decisiones',
  varianteElegida(tres, { Piezas: 'Pechuga y cuarto', Papas: 'Agrandadas' })?.id,
  '4',
);
comprobar('un plato sin decisiones: la unica variante', varianteElegida([v('x', {}, 100)], {})?.id, 'x');

console.log('\n--- Los extras ---');
const familiar = varianteElegida(pizza, { Tamano: 'Familiar' })!;
const mediana = varianteElegida(pizza, { Tamano: 'Mediana' })!;
const personal = varianteElegida(pizza, { Tamano: 'Personal' })!;
comprobar('la familiar ofrece el extra de la familiar y la salsa', complementosDe(extras, familiar).map((c) => c.id), ['qf', 'sal']);
comprobar('la mediana ofrece el suyo', complementosDe(extras, mediana).map((c) => c.id), ['qm', 'sal']);
comprobar('la personal solo la salsa', complementosDe(extras, personal).map((c) => c.id), ['sal']);

console.log('\n--- Cuanto cuesta ---');
comprobar('desde: la mas barata', precioDesde(pizza), 325000);
comprobar('sin variantes, cero', precioDesde([]), 0);
comprobar('sola', precioDeUnidad(familiar, extras, []), 995000);
comprobar('con dos extras de queso', precioDeUnidad(familiar, extras, [{ complementoId: 'qf', cantidad: 2 }]), 995000 + 160000);
comprobar(
  'extra y salsa',
  precioDeUnidad(mediana, extras, [
    { complementoId: 'qm', cantidad: 1 },
    { complementoId: 'sal', cantidad: 2 },
  ]),
  795000 + 50000 + 40000,
);
comprobar('un extra de otro tamano se rechaza', precioDeUnidad(familiar, extras, [{ complementoId: 'qm', cantidad: 1 }]), null);
comprobar('mas del maximo se rechaza', precioDeUnidad(familiar, extras, [{ complementoId: 'qf', cantidad: 4 }]), null);
comprobar('cantidad cero se rechaza', precioDeUnidad(familiar, extras, [{ complementoId: 'qf', cantidad: 0 }]), null);
comprobar('cantidad con decimales se rechaza', precioDeUnidad(familiar, extras, [{ complementoId: 'qf', cantidad: 1.5 }]), null);
comprobar('un extra inexistente se rechaza', precioDeUnidad(familiar, extras, [{ complementoId: 'zz', cantidad: 1 }]), null);
comprobar('el mismo extra dos veces se rechaza', precioDeUnidad(familiar, extras, [{ complementoId: 'qf', cantidad: 1 }, { complementoId: 'qf', cantidad: 1 }]), null);

console.log('\n--- El carrito ---');
const lineaBase = {
  itemId: 'i1',
  varianteId: 'c',
  nombre: 'Pizza',
  detalle: 'Familiar',
  cantidad: 1,
  precioUnidad: 995000,
  extras: [{ complementoId: 'qf', etiqueta: 'Extra queso', cantidad: 1, precio: 80000 }],
  notas: ['Sin cebolla'],
};
const l1 = crearLinea(lineaBase);
const l1bis = crearLinea({ ...lineaBase, notas: ['  Sin   cebolla '] });
comprobar('las notas se limpian', limpiarNota('  hola \n  mundo  '), 'hola mundo');
comprobar('una nota larguisima se corta a 100', limpiarNota('x'.repeat(300)).length, 100);
comprobar('una nota vacia se descarta', crearLinea({ ...lineaBase, notas: ['   '] }).notas, []);
comprobar('la misma combinacion tiene la misma llave', l1.llave, l1bis.llave);
comprobar('otra nota, otra llave', crearLinea({ ...lineaBase, notas: [] }).llave === l1.llave, false);
comprobar('otro extra, otra llave', crearLinea({ ...lineaBase, extras: [] }).llave === l1.llave, false);
comprobar('el orden de las notas no cambia la llave', crearLinea({ ...lineaBase, notas: ['a', 'b'] }).llave, crearLinea({ ...lineaBase, notas: ['b', 'a'] }).llave);

let carrito = agregarLinea([], l1);
carrito = agregarLinea(carrito, l1bis);
comprobar('dos lineas iguales se juntan', carrito.length, 1);
comprobar('y suman las unidades', carrito[0]!.cantidad, 2);
carrito = agregarLinea(carrito, crearLinea({ ...lineaBase, extras: [], precioUnidad: 995000 }));
comprobar('una distinta queda aparte', carrito.length, 2);
comprobar('total de las dos', totalDelCarrito(carrito), 2 * 995000 + 995000);
comprobar('unidades', unidadesDelCarrito(carrito), 3);
comprobar('no pasa del maximo por linea', agregarLinea([{ ...l1, cantidad: MAXIMO_POR_LINEA }], l1)[0]!.cantidad, MAXIMO_POR_LINEA);
comprobar('cambiar la cantidad', cambiarCantidad(carrito, l1.llave, 5)[0]!.cantidad, 5);
comprobar('a cero la quita', cambiarCantidad(carrito, l1.llave, 0).length, 1);
comprobar('una llave que no existe no rompe', cambiarCantidad(carrito, 'nada', 3).length, 2);

console.log('\n--- Lo guardado en el navegador ---');
comprobar('lo guardado vuelve igual', leerCarritoGuardado(JSON.stringify(carrito)).length, 2);
comprobar('nada guardado', leerCarritoGuardado(null), []);
comprobar('basura', leerCarritoGuardado('{no'), []);
comprobar('algo que no es lista', leerCarritoGuardado('{"a":1}'), []);
comprobar('una linea rota se descarta y las buenas se quedan', leerCarritoGuardado(JSON.stringify([{ x: 1 }, l1])).length, 1);
comprobar('cantidad absurda se descarta', leerCarritoGuardado(JSON.stringify([{ ...l1, cantidad: 9999 }])).length, 0);
comprobar('precio negativo se descarta', leerCarritoGuardado(JSON.stringify([{ ...l1, precioUnidad: -1 }])).length, 0);

console.log(fallos === 0 ? '\nTodo bien' : `\n${fallos} fallas`);
process.exit(fallos === 0 ? 0 : 1);
