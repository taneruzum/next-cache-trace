import { cacheLife, cacheTag } from 'next/cache';

export async function getCatalog() {
  'use cache';
  cacheTag('catalog'); // NCT003 together with app/admin
  cacheLife('hours');
  return [];
}
