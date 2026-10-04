/**
 * Levanta el servidor de desarrollo contra la base de PRUEBAS.
 *
 *   npm run dev:pruebas
 *
 * Sirve para mirar pantallas sin tocar la base del negocio: la de trabajo
 * tiene la contabilidad real y la de pruebas se puede llenar de datos
 * inventados y vaciar sin consecuencias.
 *
 * La direccion se deriva de DATABASE_URL igual que en las comprobaciones (ver
 * direccion-pruebas.ts) y se pasa por el entorno. Funciona porque ni Next ni
 * el cargador de .env de este proyecto pisan una variable que ya venga puesta.
 */

import { spawn } from 'node:child_process';

import { urlDePruebas, sinClave } from './direccion-pruebas';
import { cargarEnv } from './entorno';

cargarEnv();

const pruebas = urlDePruebas(process.env.DATABASE_URL);
if (process.env.DATABASE_URL && pruebas === process.env.DATABASE_URL) {
  throw new Error('La direccion de pruebas quedo igual a la de trabajo. No se levanta nada.');
}

console.log(`Base de pruebas: ${sinClave(pruebas)}`);
console.log('ATENCION: lo que se haga aqui NO toca la base del negocio.\n');

const hijo = spawn('npx', ['next', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    DATABASE_URL: pruebas,
    DIRECT_URL: urlDePruebas(process.env.DIRECT_URL),
    // La pantalla del cliente arma enlaces absolutos para WhatsApp.
    APP_URL: process.env.APP_URL ?? 'http://localhost:3000',
  },
});

hijo.on('exit', (codigo) => process.exit(codigo ?? 0));
