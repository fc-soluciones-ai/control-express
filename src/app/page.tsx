/**
 * La raiz.
 *
 * No pinta nada: manda a cada quien a su pantalla. El mostrador va al tablero
 * de entregas, que es lo que tiene que estar encendido toda la noche, y el
 * repartidor va a la suya. Antes esta era la pantalla del cierre de caja.
 *
 * Es un redireccionamiento y no una copia del tablero a proposito: dos rutas
 * pintando lo mismo significa arreglar cada cosa dos veces.
 */

import { redirect } from 'next/navigation';

import { cajeroDeSesion, repartidorDeSesion } from '@/server/services/sesion';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  const cajero = await cajeroDeSesion();
  if (cajero) redirect('/entregas');
  // El icono del telefono abre aqui. Un repartidor que ya entro va directo a su
  // pantalla, en vez de ver otra vez la de entrada cada vez que abre.
  redirect((await repartidorDeSesion()) ? '/mi' : '/entrar');
}
