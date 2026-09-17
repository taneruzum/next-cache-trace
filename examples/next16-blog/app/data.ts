import { cacheLife, cacheTag } from 'next/cache';
export async function getPosts() {
  'use cache';
  cacheLife('hours');
  cacheTag('posts');
  return [{ id: 'cache-contract', title: 'A visible cache contract', body: 'This function produces the posts tag. The refresh action invalidates that same tag.' }];
}
