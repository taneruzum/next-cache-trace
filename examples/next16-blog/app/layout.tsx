import type { ReactNode } from 'react';
export const metadata = { title: 'next-cache-trace demo' };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{fontFamily:'system-ui',maxWidth:760,margin:'64px auto',padding:24}}>{children}</body></html>;
}
