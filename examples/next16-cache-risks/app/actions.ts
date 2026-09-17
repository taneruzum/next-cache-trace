'use server';
import { revalidateTag } from 'next/cache';

export async function saveProfile() {
  revalidateTag('profile', 'max'); // NCT001: no matching literal producer
}
