# Marketing site

This is a standalone Vite app. Run it locally with:

```sh
bun install
bun run dev
```

## Deploy to Vercel

Import the repository into Vercel and set **Root Directory** to `marketing`.
Select the **Vite** framework preset. Vercel will install the dependencies,
run `bun run build`, and serve the generated `dist` directory. The app has its
own `package.json` and Bun lockfile, so it does not need the desktop app's build.
