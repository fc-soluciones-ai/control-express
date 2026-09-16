/**
 * Prueba la lectura con la IA de verdad sobre una foto, sin tocar la base.
 *
 *   npm run ia:probar -- ruta/foto.jpg ODOMETRO
 *   npm run ia:probar -- ruta/factura.jpg FACTURA
 *
 * Cuesta una lectura. Muestra lo que la IA devolvio, nunca la clave.
 */

import { readFileSync } from 'node:fs';

import { cargarEnv } from './entorno';

cargarEnv();

async function main(): Promise<void> {
  const [ruta, tipo = 'ODOMETRO'] = process.argv.slice(2);
  if (!ruta || (tipo !== 'ODOMETRO' && tipo !== 'FACTURA')) {
    throw new Error('Uso: npm run ia:probar -- <foto> [ODOMETRO|FACTURA]');
  }
  const { lectorPorDefecto } = await import('@/server/services/lectura-ia');
  const { tipoMimeSegunContenido } = await import('@/server/services/evidencia');
  const contenido = readFileSync(ruta);
  const inicio = Date.now();
  const resultado = await lectorPorDefecto(
    { contenido, tipoMime: tipoMimeSegunContenido(contenido) },
    tipo,
  );
  console.log(`${resultado.modelo}, ${Date.now() - inicio} ms`);
  console.log(JSON.stringify(resultado.lectura, null, 2));
}

main()
  .catch((e) => {
    console.error(`FALLO: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
