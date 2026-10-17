import type { Metadata, Viewport } from 'next';

/**
 * La aplicacion de los clientes. Es publica y tiene su propia cara: clara y con los
 * colores del logo, a diferencia de la caja, que es oscura para un local con poca luz.
 */
export const metadata: Metadata = {
  title: 'Pizzería La Estación · Pedí a domicilio',
  description: 'Pizza, pollo, hamburguesas y más, a tu casa.',
  // Instalada en la pantalla de inicio se llama como la pizzeria y abre el menu, no la caja.
  manifest: '/pedir/manifiesto',
  appleWebApp: { capable: true, title: 'La Estación', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // A diferencia de la caja, aqui el cliente SI puede acercar la pantalla.
  maximumScale: 5,
  userScalable: true,
  themeColor: '#c8281e',
};

export default function DisenoDePedir({ children }: { children: React.ReactNode }) {
  return <div className="cliente-app min-h-screen bg-crema text-tinta">{children}</div>;
}
