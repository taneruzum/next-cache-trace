'use server';
import { updateTag } from 'next/cache';
export async function refreshPosts() { updateTag('posts'); }
