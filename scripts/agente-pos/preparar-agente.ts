/**
 * Prepara el agente que va al servidor del local.
 *
 *   npm run agente:preparar
 *   npm run agente:preparar -- --url https://otro-dominio/api/pos/pedidos
 *
 * Inventa el secreto compartido, lo deja en el .env de aqui y en el archivo de
 * configuracion del agente, y arma la carpeta que hay que copiar al servidor.
 *
 * EL SECRETO NO SE IMPRIME NI SE PIDE POR TECLADO
 *
 * Se genera aqui y se escribe directo en los dos archivos que lo necesitan. No
 * pasa por la pantalla, ni por el chat, ni por el historial de la consola.
 * Quien lo necesita son dos programas, no una persona: nadie tiene que leerlo
 * ni recordarlo nunca.
 *
 * Despues de correr esto quedan dos cosas por hacer, y las dice al final:
 * subir la variable a Vercel y copiar la carpeta al servidor del local.
 */

import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { cargarEnv } from '../entorno';

cargarEnv();

const CARPETA = path.resolve('scripts/agente-pos');
const DESTINO = path.resolve('storage/agente-pos');
const RUTA_ENV = path.resolve('.env');

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** Escribe o reemplaza una variable en el .env sin tocar las demas. */
function ponerEnElEnv(clave: string, valor: string): void {
  const actual = existsSync(RUTA_ENV) ? readFileSync(RUTA_ENV, 'utf8') : '';
  const linea = `${clave}="${valor}"`;
  const patron = new RegExp(`^${clave}=.*$`, 'm');
  const nuevo = patron.test(actual)
    ? actual.replace(patron, linea)
    : `${actual.replace(/\s*$/, '')}\n${linea}\n`;
  writeFileSync(RUTA_ENV, nuevo, 'utf8');
}

function main(): void {
  const base = argumento('url') ?? process.env.APP_URL ?? 'https://control-express.vercel.app';
  const url = base.endsWith('/api/pos/pedidos')
    ? base
    : `${base.replace(/\/+$/, '')}/api/pos/pedidos`;

  // Si ya hay uno, se conserva: cambiarlo dejaria al agente del local
  // hablando con un secreto viejo hasta que alguien suba la carpeta de nuevo.
  const existente = process.env.POS_AGENTE_SECRETO;
  const secreto = existente && existente.length >= 32 ? existente : randomBytes(32).toString('base64url');
  const esNuevo = secreto !== existente;

  ponerEnElEnv('POS_AGENTE_SECRETO', secreto);
  ponerEnElEnv('APP_URL', base.replace(/\/api\/pos\/pedidos$/, '').replace(/\/+$/, ''));

  // La carpeta que se copia al servidor del local. Va a storage/, que git
  // ignora, porque lleva el secreto adentro.
  mkdirSync(DESTINO, { recursive: true });
  copyFileSync(path.join(CARPETA, 'agente-pos.ps1'), path.join(DESTINO, 'agente-pos.ps1'));
  copyFileSync(path.join(CARPETA, 'PROBAR-AGENTE.bat'), path.join(DESTINO, 'PROBAR-AGENTE.bat'));
  copyFileSync(path.join(CARPETA, 'ARRANCAR-AGENTE.bat'), path.join(DESTINO, 'ARRANCAR-AGENTE.bat'));
  copyFileSync(path.join(CARPETA, 'LEAME.txt'), path.join(DESTINO, 'LEAME.txt'));
  writeFileSync(
    path.join(DESTINO, 'agente-pos.config.json'),
    JSON.stringify({ url, secreto, diasAlArrancar: 7 }, null, 2) + '\n',
    'utf8',
  );

  console.log(`Secreto: ${esNuevo ? 'generado' : 'se conservo el que ya habia'} (no se imprime a proposito).`);
  console.log(`Destino de los pedidos: ${url}\n`);
  console.log(`Carpeta lista para copiar al servidor del local:`);
  console.log(`  ${DESTINO}\n`);
  console.log('Falta:');
  console.log('  1. Subir la variable a Vercel:   npm run vercel:variables -- --aplicar');
  console.log('  2. Copiar esa carpeta a PZLE-SVR-02 y correr PROBAR-AGENTE.bat.');
  console.log('\nEsa carpeta lleva el secreto adentro: no se manda por correo ni por chat.');
}

main();
