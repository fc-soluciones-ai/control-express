import { Quiosco } from '@/components/quiosco/Quiosco';
import { menuDeLaApp } from '@/server/services/menu-app';
import { infoDeLaApp } from '@/server/services/pedidos-app';

export const dynamic = 'force-dynamic';

export default async function PaginaDePedir() {
  const [menu, info] = await Promise.all([menuDeLaApp(), infoDeLaApp()]);
  return <Quiosco menu={menu} info={info} />;
}
