/**
 * Guarda la clave de la IA que lee las fotos de gasolina.
 *
 *   npm run ia:clave
 *
 * Sirve para Gemini (Google AI Studio, empieza con AIza) o para Claude
 * (Anthropic, empieza con sk-ant-): se reconoce por el comienzo. Si estan las
 * dos, la aplicacion usa Gemini.
 *
 * La clave se teclea (o se pega) en la terminal y no se muestra. Se prueba
 * contra el proveedor antes de escribirla en .env, que git ignora. Nunca se
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

interface Proveedor {
  nombre: string;
  variable: string;
  prueba: (clave: string) => Promise<Response>;
}

// Consultas que no cuestan nada: solo confirman que la clave sirve.
const GEMINI: Proveedor = {
  nombre: 'Gemini',
  variable: 'GEMINI_API_KEY',
  prueba: (clave) =>
    fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': clave },
    }),
};
const ANTHROPIC: Proveedor = {
  nombre: 'Claude',
  variable: 'ANTHROPIC_API_KEY',
  prueba: (clave) =>
    fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
    }),
};

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
  const clave = (await preguntarOculto('Pegue la clave de la IA (no se muestra): ')).trim();
  const proveedor = clave.startsWith('AIza')
    ? GEMINI
    : clave.startsWith('sk-ant-')
      ? ANTHROPIC
      : null;
  if (!proveedor) {
    throw new Error(
      'Eso no parece una clave de Gemini (empiezan con AIza) ni de Anthropic (sk-ant-).',
    );
  }

  const prueba = await proveedor.prueba(clave);
  if (!prueba.ok) {
    throw new Error(
      [400, 401, 403].includes(prueba.status)
        ? `${proveedor.nombre} rechazo la clave. Revise que la copio completa.`
        : `${proveedor.nombre} respondio ${prueba.status}. Intente de nuevo.`,
    );
  }
  const variable = proveedor.variable;

  let contenido = '';
  try {
    contenido = await readFile(RUTA_ENV, 'utf8');
  } catch {
    // Sin .env todavia: se crea.
  }
  const linea = `${variable}="${clave}"`;
  const patron = new RegExp(`^${variable}=.*$`, 'm');
  contenido = patron.test(contenido)
    ? contenido.replace(patron, () => linea)
    : `${contenido.replace(/\s*$/, '')}\n\n# ---- Lectura de fotos con IA ----\n${linea}\n`;
  await writeFile(RUTA_ENV, contenido, 'utf8');

  console.log(`Clave de ${proveedor.nombre} probada y guardada en .env.`);
  console.log('Para la version publicada:  npm run vercel:variables -- --aplicar');
}

main().catch((e) => {
  console.error(`\nFALLO: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
