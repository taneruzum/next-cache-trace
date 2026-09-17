# Buildable Next.js 16 example

From this directory run `npm ci`, `npm run build`, then `npm start` (or `npm run dev`). No database, credentials, fonts service or external API is needed.

From the repository root:

```bash
node bin/next-cache-trace.js audit examples/next16-blog
node bin/next-cache-trace.js audit examples/next16-blog --format html --output artifacts/blog.html
```

Expected: one `posts` producer, one invalidation, one cache boundary, zero findings. The adjacent `next16-cache-risks` fixture deliberately triggers all five rules; it is not a runnable app.
