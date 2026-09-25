/**
 * Prueba de los ayudantes de busqueda, filtros y paginacion.
 *
 * No tocan la base: son las reglas de como se arma la direccion y como se
 * compara el texto. Se prueban aparte porque un error aqui no rompe nada de
 * forma visible, solo devuelve una lista equivocada.
 *
 * Ejecutar con: npm run test:consulta
 */

import {
  TAMANOS_DE_PAGINA,
  conParametros,
  paginaDe,
  paraBuscar,
  tamanoDePagina,
} from '@/lib/consulta';

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

function main(): void {
  console.log('--- La direccion lleva los filtros ---');

  comprobar(
    'agrega un filtro',
    conParametros('/motos', '', { estado: 'OPERATIVA' }),
    '/motos?estado=OPERATIVA',
  );
  comprobar(
    'conserva los que ya estaban',
    conParametros('/motos', 'estado=OPERATIVA', { buscar: 'honda' }),
    '/motos?estado=OPERATIVA&buscar=honda',
  );
  comprobar(
    'el valor vacio quita el filtro',
    conParametros('/motos', 'estado=OPERATIVA&buscar=honda', { estado: '' }),
    '/motos?buscar=honda',
  );
  comprobar(
    'y null tambien',
    conParametros('/motos', 'estado=OPERATIVA', { estado: null }),
    '/motos',
  );
  comprobar(
    'los espacios de sobra no cuentan',
    conParametros('/motos', '', { buscar: '  ' }),
    '/motos',
  );

  // Cambiar un filtro estando en la pagina cuatro mostraba una tabla vacia
  // que parecia un error.
  comprobar(
    'cambiar un filtro vuelve a la primera pagina',
    conParametros('/motos/reportes', 'pagina=4&categoria=LLANTAS', { buscar: 'delta' }),
    '/motos/reportes?categoria=LLANTAS&buscar=delta',
  );
  comprobar(
    'pero pasar de pagina no se estorba a si mismo',
    conParametros('/motos/reportes', 'pagina=4&categoria=LLANTAS', { pagina: 5 }),
    '/motos/reportes?pagina=5&categoria=LLANTAS',
  );

  console.log('\n--- Paginacion ---');

  comprobar('la pagina por defecto es la primera', paginaDe(undefined), 1);
  comprobar('un texto que no es numero cae en la primera', paginaDe('abc'), 1);
  comprobar('y un negativo tambien', paginaDe('-3'), 1);
  comprobar('un numero valido se respeta', paginaDe('7'), 7);
  comprobar('el decimal no sirve como pagina', paginaDe('2.5'), 1);

  comprobar('el tamano por defecto son 25', tamanoDePagina(undefined), 25);
  comprobar('un tamano permitido se respeta', tamanoDePagina('50'), 50);
  comprobar(
    'uno inventado no pasa, para que nadie pida 10.000 filas',
    tamanoDePagina('10000'),
    25,
  );
  comprobar('los tamanos ofrecidos', TAMANOS_DE_PAGINA, [10, 25, 50]);

  console.log('\n--- Comparar texto como lo escribe la gente ---');

  comprobar('ignora mayusculas', paraBuscar('DAVID-R'), 'david-r');
  comprobar('ignora tildes', paraBuscar('Fredón'), 'fredon');
  comprobar('y la enie se conserva', paraBuscar('Muñoz').includes('n'), true);
  comprobar('recorta los extremos', paraBuscar('  Honda  '), 'honda');
  comprobar(
    'asi "fredon" encuentra "Fredón Fire 200"',
    paraBuscar('Fredón Fire 200').includes(paraBuscar('fredon')),
    true,
  );

  console.log(
    fallos === 0
      ? '\nTodas las comprobaciones pasaron.\n'
      : `\n${fallos} comprobacion(es) fallaron.\n`,
  );
  process.exitCode = fallos === 0 ? 0 : 1;
}

main();
