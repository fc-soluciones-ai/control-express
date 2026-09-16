/**
 * Guarda la clave de la API de Anthropic, la que lee las fotos de gasolina.
 *
 *   npm run ia:clave
 *
 * La clave se teclea (o se pega) en la terminal y no se muestra. Se prueba
 * contra Anthropic antes de escribirla en .env, que git ignora. Nunca se
 * imprime ni se pasa como argumento.
 *
 * Despues, para que la use la version publicada:
 *
 *   npm run vercel:variables -- --aplicar
 *
 * y volver a desplegar.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';

const RUTA_ENV = path.resolve(process.cwd(), '.env');
const NOMBRE = 'ANTHROPIC_API_KEY';

/** Lee de la terminal sin mostrar lo tecleado. */
function preguntarOculto(pregunta: string): Promise<string> {
  return new Promise((resolver) => {
    const salida = process.stdout;
    const lector = createInterface({ input: process.stdin, output: salida, terminal: true });
    let silenciado = false;
    const escribir = salida.write.bind(salida);
    (lector as unknown as { _writeToOutput: (t: string) => void })._writeToOutput = (t) => {
      if (!silenciado) escribir(t);
    };
    lector.question(pregunta, (r) => {
      lector.close();
      escribir('\n');
      resolver(r);
    });
    silenciado = true;
  });
}

async function main(): Promise<void> {
  const clave = (await preguntarOculto('Pegue la clave de Anthropic (no se muestra): ')).trim();
  if (!clave.startsWith('sk-ant-')) {
    throw new Error('Eso no parece una clave de Anthropic (empiezan con sk-ant-).');
  }

  // Una consulta que no cuesta nada: solo confirma que la clave sirve.
  const prueba = await fetch('https://api.anthropic.com/v1/models?limit=1', {
    headers: { 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
  });
  if (!prueba.ok) {
    throw new Error(
      prueba.status === 401
        ? 'Anthropic rechazo la clave. Revise que la copio completa.'
        : `Anthropic respondio ${prueba.status}. Intente de nuevo.`,
    );
  }

  let contenido = '';
  try {
    contenido = await readFile(RUTA_ENV, 'utf8');
  } catch {
    // Sin .env todavia: se crea.
  }
  const linea = `${NOMBRE}="${clave}"`;
  const patron = new RegExp(`^${NOMBRE}=.*$`, 'm');
  contenido = patron.test(contenido)
    ? contenido.replace(patron, () => linea)
    : `${contenido.replace(/\s*$/, '')}\n\n# ---- Lectura de fotos con IA ----\n${linea}\n`;
  await writeFile(RUTA_ENV, contenido, 'utf8');

  console.log('Clave probada y guardada en .env.');
  console.log('Para la version publicada:  npm run vercel:variables -- --aplicar');
}

main().catch((e) => {
  console.error(`\nFALLO: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
