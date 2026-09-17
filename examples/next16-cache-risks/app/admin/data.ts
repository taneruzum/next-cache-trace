import { cacheLife, cacheTag } from 'next/cache';

export async function getAdminCatalog() {
  'use cache';
  cacheTag('catalog'); // NCT003 together with app/catalog
  cacheLife('hours');
  return [];
}
