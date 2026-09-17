import { cacheTag } from 'next/cache';
import { cookies } from 'next/headers';

export async function getDashboard() {
  'use cache';
  const session = await cookies(); // NCT002: request data in a cached boundary
  cacheTag('dashboard'); // NCT005: no cacheLife policy
  return { name: session.get('name')?.value };
}
