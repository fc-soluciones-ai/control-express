import { Quiosco } from '@/components/quiosco/Quiosco';
import { menuDeLaApp } from '@/server/services/menu-app';

export const dynamic = 'force-dynamic';

export default async function PaginaDePedir() {
  const menu = await menuDeLaApp();
  return <Quiosco menu={menu} />;
}
