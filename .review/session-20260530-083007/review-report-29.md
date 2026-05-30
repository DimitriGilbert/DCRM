# Code Review Report — Cluster 29

**Reviewer**: Automated Code Review Expert
**Date**: 2026-05-30
**Scope**: Web App Core — Router, Auth, Middleware, API Routes
**Files Reviewed**: 13 files

---

## Summary

The authentication flow (middleware → server function → route guards) is correctly implemented. Session validation happens server-side via Better Auth's `getSession`, and unauthenticated users are properly redirected. The tRPC proxy correctly forwards the original request (including cookies) for auth resolution. The auth API proxy follows the standard Better Auth integration pattern.

Three real issues were found: one HIGH-severity DoS vector in the webhook handler, one MEDIUM-severity UX bug in the global error handler, and one MEDIUM-severity information disclosure in webhook error responses.

---

### [SEVERITY: HIGH] Finding 1: Webhook Endpoint Buffers Entire Request Body Without Size Limit Before Token Validation

**File**: `apps/web/src/routes/api/webhook/$token.ts:14`
**Problem**: The handler reads the complete request body into memory via `request.text()` **before** the URL token is validated against the database. An attacker can send an arbitrarily large payload to `/api/webhook/<any-string>` and the server will buffer the entire body in memory, regardless of whether the token is valid. This creates a memory exhaustion DoS vector that requires no authentication and no knowledge of valid webhook tokens.

**Evidence**:
```typescript
// Line 5-6: Token extracted from URL but NOT validated against DB yet
const urlToken = params["token"];
if (!urlToken) { ... }

return (async () => {
  // Line 14: FULL body buffered into memory — no size limit, token not yet validated
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("X-DCRM-Signature");

  // Line 17: Token validation happens HERE — after body is already in memory
  const result = await receiveIncomingWebhook(urlToken, rawBody, signatureHeader);
```

The validation chain is: `receiveIncomingWebhook` → `handleIncomingWebhook` (in `@DCRM/webhooks`) → `deps.findByToken(urlToken)`. Only at this point does the database lookup occur to check if the token is valid.

**Impact**: An unauthenticated attacker can exhaust server memory by POSTing large bodies to `/api/webhook/<any-gibberish>`. Each request allocates a string proportional to the body size in Node.js heap memory. With concurrent requests, this can cause OOM crashes, taking down the entire application. The attacker does not need any valid webhook tokens.

**Suggestion**: Add a body size limit check before reading the body. Two approaches:

**(A) Reject oversized requests early** (recommended):
```typescript
const MAX_WEBHOOK_BODY_SIZE = 1024 * 1024; // 1 MB

function handler({ request, params }: { request: Request; params: Record<string, string> }) {
  const urlToken = params["token"];
  if (!urlToken) {
    return new Response(JSON.stringify({ error: "Missing webhook token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Reject before buffering if Content-Length exceeds limit
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && parseInt(contentLength, 10) > MAX_WEBHOOK_BODY_SIZE) {
    return new Response(JSON.stringify({ error: "Request body too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  return (async () => {
    // For chunked transfers where Content-Length is absent,
    // use a readable stream with byte counting instead of request.text()
    const rawBody = await request.text();

    // Belt-and-suspenders: also check actual body length
    if (rawBody.length > MAX_WEBHOOK_BODY_SIZE) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    const signatureHeader = request.headers.get("X-DCRM-Signature");
    const result = await receiveIncomingWebhook(urlToken, rawBody, signatureHeader);

    return new Response(JSON.stringify(result.body), {
      status: result.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  })();
}
```

**(B)** Alternatively, configure a reverse proxy (nginx, Cloudflare) to enforce a request body size limit for `/api/webhook/*` routes. This is defense-in-depth but should not be the sole protection.

---

### [SEVERITY: MEDIUM] Finding 2: Global QueryCache onError Fires Toasts on Background Refetch Failures

**File**: `apps/web/src/router.tsx:14-22`
**Problem**: The `QueryCache` is configured with a global `onError` callback that shows a toast notification for **every** failed query. React Query's `onError` fires not only for initial query failures but also for background refetch failures and prefetch failures. Transient network hiccups during background refreshes will produce spurious error toasts that disrupt the user.

**Evidence**:
```typescript
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // This fires for ALL query failures, including:
      // - Initial loads (correct — user should be notified)
      // - Background refetches (incorrect — noisy and disruptive)
      // - Prefetches (incorrect — user didn't initiate this)
      toast.error(error.message, {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
```

**Impact**: Users will see intermittent error toasts when the app performs background data refreshes and encounters a momentary network issue or server error. The "retry" action is confusing for background refetches (the user didn't initiate the request). This creates a poor UX where the app appears broken even when data is already displayed from the cache.

**Suggestion**: Only show toasts for user-initiated queries (initial loads), not background refetches. Check `query.state.data !== undefined` to distinguish — if cached data already exists, the failure is from a background refetch:

```typescript
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Only toast for initial-load failures (no cached data yet).
      // Background refetch failures are silent — data is still displayed from cache.
      if (query.state.data === undefined) {
        toast.error(error.message, {
          action: {
            label: "retry",
            onClick: query.invalidate,
          },
        });
      }
    },
  }),
```

---

### [SEVERITY: MEDIUM] Finding 3: Webhook Handler Returns Distinct Status Codes Per Error State, Enabling Token Enumeration

**File**: `apps/web/src/routes/api/webhook/$token.ts:13-24` (and `packages/webhooks/src/incoming.ts:142-167`)
**Problem**: The webhook handler returns different HTTP status codes and error messages depending on the state of the webhook token:
- `404 "Webhook not found"` — token doesn't exist
- `410 "Webhook is disabled"` — token exists but webhook is disabled
- `401 "Missing X-DCRM-Signature" / "Invalid signature"` — token exists and has a secret configured
- `422 "No mapping configuration"` — token exists, is enabled, passed auth, but no mapping
- `400 "Invalid JSON"` — token is valid, body parsing failed

An attacker probing `/api/webhook/<candidate-token>` with different payloads can distinguish between non-existent tokens and valid ones based on the response status code. This allows token enumeration.

**Evidence**:
From `packages/webhooks/src/incoming.ts`:
```typescript
// Line 142-148: Token not found → 404
if (webhook === null) {
  return { accepted: false, statusCode: 404, body: { error: "Webhook not found" } };
}

// Line 151-157: Token found but disabled → 410
if (!webhook.enabled) {
  return { accepted: false, statusCode: 410, body: { error: "Webhook is disabled" } };
}

// Line 161-167: Token found, has secret, bad signature → 401
if (!verification.valid) {
  return { accepted: false, statusCode: 401, body: { error: verification.reason } };
}
```

**Impact**: An attacker can probe the webhook endpoint to determine which tokens are valid, which webhooks are disabled, and which have HMAC secrets configured. For a single-user CRM, this is lower risk since webhook tokens should be high-entropy random strings, but it violates the principle of not leaking information about resource existence through API responses. If webhook tokens ever use predictable formats (e.g., sequential IDs, short hex strings), this becomes a direct attack vector.

**Suggestion**: Normalize error responses for unauthenticated requests to avoid leaking token state. Return the same generic error for both "not found" and "disabled" cases:

In `packages/webhooks/src/incoming.ts`, collapse the early responses:
```typescript
// Merge "not found" and "disabled" into the same response
if (webhook === null || !webhook.enabled) {
  return {
    accepted: false,
    statusCode: 404,
    body: { error: "Webhook not found" },
  };
}
```

This ensures that an attacker cannot distinguish between a non-existent token and a disabled one. The `401` for signature failures is acceptable since it only fires after a valid token is found — the attacker already knows the token at that point.

---

## Files With No Issues Found

The following files were reviewed and found to be correctly implemented:

- **`apps/web/src/routes/__root.tsx`** — Clean root layout with proper context typing, meta tags, and stylesheet loading.
- **`apps/web/src/routes/index.tsx`** — Correctly redirects authenticated users to `/dashboard`. The `beforeLoad` guard using the server function is the right pattern.
- **`apps/web/src/routes/login.tsx`** — Clean sign-in/sign-up toggle. No auth guard is present (logged-in users can visit `/login`), but this is a minor UX concern, not a security issue — the user simply sees the login form.
- **`apps/web/src/routes/_authenticated.tsx`** — Auth guard correctly uses `getUser()` server function in `beforeLoad`, redirects to `/login` on missing session. The component's `authClient.useSession()` is for display only (user name in sidebar) and does not affect the security boundary.
- **`apps/web/src/lib/auth-client.ts`** — Minimal Better Auth client, defaults to same-origin which is correct.
- **`apps/web/src/utils/trpc.ts`** — Standard tRPC context setup.
- **`apps/web/src/middleware/auth.ts`** — Correctly resolves session via `auth.api.getSession` with request headers, passes session through context.
- **`apps/web/src/functions/get-user.ts`** — Server function with auth middleware, returns session from context. Correct pattern.
- **`apps/web/src/routes/api/auth/$.ts`** — Standard Better Auth proxy pattern, handles GET and POST.
- **`apps/web/src/routes/api/trpc/$.ts`** — Correctly forwards original request to tRPC's `fetchRequestHandler`, preserving cookies for auth resolution in `createContext`. Endpoint path matches the client configuration (`/api/trpc`).
- **`apps/web/vite.config.ts`** — Standard TanStack Start Vite config.
