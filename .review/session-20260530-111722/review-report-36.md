# Review Report — Cluster 36

**Reviewer**: Code Review Expert  
**Date**: 2026-05-30  
**Files Reviewed**: `apps/desktop/src/bun/index.ts`  
**Scope**: Electrobun desktop application entry point — dev/prod mode detection, window configuration

---

## Summary

This is a small, focused entry point file (35 lines) that creates a BrowserWindow for the Electrobun desktop shell. It handles dev vs. prod URL resolution and window configuration. The code is straightforward and well-structured for its purpose.

**1 finding** (no critical or high-severity issues).

---

### [SEVERITY: MEDIUM] Finding 1: Hardcoded dev server port with no configurability

**File**: `apps/desktop/src/bun/index.ts:3`
**Problem**: The dev server port `3001` is hardcoded as a constant with no way to override it. If the TanStack Start web app's dev server is configured on a different port (e.g., via environment variable or Vite config), the HMR detection and URL will silently point to the wrong port. The `fetch` HEAD check on line 11 would fail, and the app would fall back to the static build — but with a misleading console message suggesting the user should run `pnpm run dev:hmr`.

**Evidence**:
```ts
const DEV_SERVER_PORT = 3001;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
```

**Impact**: If the web dev server port ever changes (common in monorepos where multiple apps compete for ports), the dev-mode HMR will silently break. The fallback to `views://mainview/index.html` means it won't crash, but developers will waste time debugging why HMR isn't working.

**Suggestion**: Read the port from an environment variable with the current value as default:
```ts
const DEV_SERVER_PORT = Number(process.env.DEV_SERVER_PORT) || 3001;
```
This is a low-priority improvement — the current code works correctly for the default setup and the fallback behavior is safe.

---

## Overall Assessment

The file is clean, simple, and fit-for-purpose. The dev/prod mode detection pattern (check `Updater.localInfo.channel`, then probe the dev server with a HEAD request) is reasonable. The fallback to the static build when the dev server isn't running is correct behavior. The BrowserWindow configuration is minimal but appropriate for an MVP shell.

**Findings: 1** (Medium: hardcoded dev server port)
