import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
export async function fixture(t, files = {}) {
  const root = await mkdtemp(join(tmpdir(), 'nct-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    const target = join(root, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}
export const cacheImports = "import { cacheTag, cacheLife, revalidateTag, updateTag, unstable_cache } from 'next/cache';\n";
export const headerImports = "import { cookies, headers, draftMode } from 'next/headers';\n";
