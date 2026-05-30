# DCRM Desktop

The desktop app is an Electrobun shell for the DCRM web application. It intentionally stays thin: it opens the web UI in a dedicated desktop window and does not implement desktop-only CRM behavior.

## Build model

- `pnpm --filter desktop build` builds `web` first, then packages the Electrobun app.
- `electrobun.config.ts` copies `apps/web/dist/client` into `views/mainview`.
- The packaged app loads `views://mainview/index.html`.
- In the Electrobun `dev` channel, the shell may use the web dev server at `http://localhost:3001` when it is already running for HMR.

## Commands

Run from the repository root:

```bash
pnpm --filter desktop check-types
pnpm --filter desktop build
pnpm run build:desktop
pnpm run build:desktop:canary
```

Do not add native desktop features here unless a future PRD phase explicitly requires wrapper functionality.
