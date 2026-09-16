import type { Metadata, Viewport } from 'next';

import { AvisoDemostracion } from '@/components/AvisoDemostracion';

import './globals.css';

export const metadata: Metadata = {
  title: 'Control Express',
  description: 'Caja, repartidores y flota de motos',
  // Al agregarla a la pantalla de inicio del iPhone, que abra como aplicacion
  // y no dentro de Safari. Android lo toma del manifiesto (app/manifest.ts).
  appleWebApp: {
    capable: true,
    title: 'Control Express',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // El monitor de caja no se pellizca ni se acerca: un zoom accidental a media
  // noche deja la pantalla inservible hasta que alguien sepa deshacerlo.
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0b1120',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CR">
      <body className="min-h-screen">
        <AvisoDemostracion />
        {children}
      </body>
    </html>
  );
}
