/**
 * Lo que el telefono necesita para instalar la app de los clientes en la pantalla de
 * inicio, con su propio nombre, icono y direccion de arranque.
 *
 * Sin esto, "agregar a la pantalla de inicio" desde /pedir instalaba la app de la CAJA
 * (Control Express), que abre el tablero y pide usuario y PIN. Aqui el cliente instala
 * "Pizzeria La Estacion" y se abre directo en el menu.
 *
 * Los iconos son los mismos del logo que ya usa la caja (los genera scripts/preparar-logo.py).
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export function GET(): Response {
  return NextResponse.json(
    {
      name: 'Pizzería La Estación',
      short_name: 'La Estación',
      description: 'Pizza, pollo y hamburguesas a tu casa.',
      start_url: '/pedir',
      // Solo las pantallas del cliente: la caja no se abre desde este icono.
      scope: '/pedir',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#fff6e6',
      theme_color: '#c8281e',
      lang: 'es-CR',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    { headers: { 'content-type': 'application/manifest+json' } },
  );
}
