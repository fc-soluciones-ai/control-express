/**
 * Lo que el telefono necesita para instalar la aplicacion en la pantalla de
 * inicio: nombre, icono y como abrirla.
 *
 * "standalone" la abre sin la barra de direcciones del navegador, como una
 * aplicacion. El repartidor la usa con una mano en la calle: la barra de
 * direcciones solo le quita espacio y le da donde tocar por error.
 *
 * Los iconos los genera scripts/preparar-logo.py a partir del logo original.
 */

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Control Express',
    short_name: 'Control Express',
    description: 'Caja, repartidores y flota de motos',
    start_url: '/',
    display: 'standalone',
    // Sin orientacion fija: el repartidor la usa de pie en el telefono, pero
    // la caja corre en un monitor horizontal. Forzar una de las dos rompe la
    // otra.
    orientation: 'any',
    // Mismo tono que la aplicacion: la pantalla de arranque no parpadea en
    // blanco antes de mostrar el tablero oscuro.
    background_color: '#0b1120',
    theme_color: '#0b1120',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        // Android recorta estos en circulo o gota; el dibujo va con margen
        // de sobra para que no le corte las ruedas al tren.
        purpose: 'maskable',
      },
    ],
  };
}
