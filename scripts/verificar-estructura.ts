/**
 * Comprobacion de la logica del menu de la app (sin base de datos).
 *
 *   npm run test:estructura
 *
 * De aqui depende que el cliente no pueda pedir una combinacion que no existe y
 * que el precio que se le cobra sea el de la caja.
 */

import {
  LARGO_ETIQUETA,
  LARGO_SENAS,
  LIBRETA_VACIA,
  MAX_DIRECCIONES,
  direccionActiva,
  direccionValida,
  elegirDireccion,
  guardarDireccion,
  leerLibreta,
  nuevoIdDeDireccion,
  quitarDireccion,
  tituloDeDireccion,
} from '@/lib/pedido/ubicacion';
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

console.log('\n--- Las direcciones guardadas en el telefono ---');
const dir = (id: string, etiqueta: string, lat = 10.02, lng = -84.2) => ({ id, etiqueta, lat, lng, precisionM: 12, senas: 'casa verde, porton negro' });
comprobar('nada guardado: libreta vacia', leerLibreta(null), LIBRETA_VACIA);
comprobar('basura: libreta vacia', leerLibreta('{no es json'), LIBRETA_VACIA);
comprobar('algo que no es objeto: libreta vacia', leerLibreta('42'), LIBRETA_VACIA);
const casa = dir('casa-0001', 'Casa');
const trabajo = dir('trabajo-0001', 'Trabajo', 10.03, -84.21);
let lib = guardarDireccion(LIBRETA_VACIA, casa);
comprobar('guardar la primera la deja activa', lib.activaId, 'casa-0001');
lib = guardarDireccion(lib, trabajo);
comprobar('la ultima guardada pasa a ser la activa', lib.activaId, 'trabajo-0001');
comprobar('y quedan las dos', lib.direcciones.length, 2);
comprobar('lo guardado vuelve igual', leerLibreta(JSON.stringify(lib)).direcciones.length, 2);
comprobar('una "Casa" nueva reemplaza a la vieja', guardarDireccion(lib, dir('casa-0002', 'Casa')).direcciones.filter((d) => d.etiqueta === 'Casa').length, 1);
comprobar('elegir otra', elegirDireccion(lib, 'casa-0001').activaId, 'casa-0001');
comprobar('elegir una que no existe no cambia nada', elegirDireccion(lib, 'nada-0000').activaId, 'trabajo-0001');
comprobar('quitar la activa pasa a otra', quitarDireccion(lib, 'trabajo-0001').activaId, 'casa-0001');
comprobar('quitar la ultima deja vacio', quitarDireccion(quitarDireccion(lib, 'trabajo-0001'), 'casa-0001').activaId, null);
comprobar('la activa es la que dice activaId', direccionActiva(lib)?.id, 'trabajo-0001');
let llena = LIBRETA_VACIA;
for (let i = 0; i < 8; i += 1) llena = guardarDireccion(llena, dir(`otra-${i}-0000`, ''));
comprobar('no pasa del maximo', llena.direcciones.length, MAX_DIRECCIONES);
comprobar('y la ultima guardada sigue activa', llena.activaId, 'otra-7-0000');
comprobar('una direccion fuera de Costa Rica se descarta', direccionValida(dir('miami-0001', 'Casa', 25.76, -80.19)), null);
comprobar('una sin id valido se descarta', direccionValida({ ...casa, id: "x'; DROP" }), null);
comprobar('una con coordenadas que no son numeros se descarta', direccionValida({ ...casa, lat: '10' }), null);
comprobar('un texto larguisimo se corta', direccionValida({ ...casa, senas: 'x'.repeat(900) })?.senas.length, LARGO_SENAS);
comprobar('una etiqueta larguisima se corta', direccionValida({ ...casa, etiqueta: 'e'.repeat(90) })?.etiqueta.length, LARGO_ETIQUETA);
comprobar('lo roto se descarta y lo bueno se queda', leerLibreta(JSON.stringify({ direcciones: [{ id: 'x' }, casa], activaId: 'casa-0001' })).direcciones.length, 1);
comprobar('una activa que no existe se corrige', leerLibreta(JSON.stringify({ direcciones: [casa], activaId: 'fantasma-0000' })).activaId, 'casa-0001');
comprobar('el titulo junta etiqueta y senas', tituloDeDireccion(casa, 60), 'Casa · casa verde, porton negro');
comprobar('el titulo largo se recorta', tituloDeDireccion(casa, 12).length, 12);
comprobar('sin nada, un titulo generico', tituloDeDireccion({ ...casa, etiqueta: '', senas: '' }), 'Ubicación marcada');
comprobar('los ids nuevos no se repiten', nuevoIdDeDireccion() === nuevoIdDeDireccion(), false);

console.log(fallos === 0 ? '\nTodo bien' : `\n${fallos} fallas`);
process.exit(fallos === 0 ? 0 : 1);
