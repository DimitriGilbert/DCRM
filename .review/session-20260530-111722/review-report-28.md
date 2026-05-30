# Code Review Report — Cluster 28

**Reviewer**: Code Reviewer (automated)
**Date**: 2026-05-30
**Scope**: Root route, app layout, authenticated layout, login page, router initialization, auth middleware, API route handlers (auth, tRPC, webhook)
**Files reviewed**: 12

---

### [SEVERITY: MEDIUM] Finding 1: Login page allows authenticated users to access sign-up form

**File**: `apps/web/src/routes/login.tsx:7-9`
**Problem**: The `/login` route has no `beforeLoad` guard. Authenticated users who navigate directly to `/login` (via bookmark, browser history, or shared link) will see the login/signup forms instead of being redirected to the dashboard. The default state (`showSignIn = false`) means the **sign-up form** is shown first, which is especially confusing for an already-logged-in user.

**Evidence**:
```ts
// login.tsx — no beforeLoad auth check
export const Route = createFileRoute("/login")({
  component: RouteComponent,  // no beforeLoad
});

function RouteComponent() {
  const [showSignIn, setShowSignIn] = useState(false); // defaults to SignUp form
```

Compare with `_authenticated.tsx` which correctly gates access:
```ts
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const session = await getUser();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
```

And `index.tsx` which redirects authenticated users away:
```ts
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getUser();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
```

**Impact**:
- Confusing UX: authenticated users see a "Create Account" form when visiting `/login`.
- Users may attempt to create a duplicate account with the same email, leading to confusing error messages from Better Auth.
- Inconsistent with the auth-gating pattern used everywhere else in the app.

**Suggestion**: Add a `beforeLoad` that redirects authenticated users to `/dashboard`:
```ts
export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await getUser();
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: RouteComponent,
});
```

---

### [SEVERITY: MEDIUM] Finding 2: Webhook endpoint body-size enforcement has two gaps allowing oversized payloads

**File**: `apps/web/src/routes/api/webhook/$token.ts:15-30`
**Problem**: The webhook handler's body-size protection has two weaknesses that, when combined, allow payloads exceeding the intended 1MB limit to reach the processing layer.

**Gap A — Content-Length header bypass via chunked transfer encoding**:
When `Content-Length` is absent (e.g., chunked transfer encoding), the first size check is skipped entirely. The entire body is read into memory before the second check runs. An attacker can exploit this by sending large chunked requests to consume server memory.

**Gap B — `rawBody.length` counts UTF-16 code units, not bytes**:
The second check (`rawBody.length > MAX_BODY_BYTES`) measures JavaScript string length (UTF-16 code units), not actual byte size. A payload with multi-byte Unicode characters can exceed 1MB in bytes while having a `.length` under 1,048,576. For example, a string of 1M four-byte emoji characters is 4MB in bytes but `rawBody.length === 1,000,000`.

**Evidence**:
```ts
// Gap A: Content-Length can be null for chunked encoding
const contentLength = request.headers.get("Content-Length");
if (contentLength !== null && Number(contentLength) > MAX_BODY_BYTES) {
  // ... rejection — but skipped entirely when Content-Length is absent
}

// Body fully buffered before second check
return (async () => {
  const rawBody = await request.text();  // entire body now in memory

  // Gap B: .length is character count, not byte count
  if (rawBody.length > MAX_BODY_BYTES) {
    // ... rejection — but already allocated memory, and can under-count
  }
```

**Impact**:
- Denial-of-service vector: an attacker who knows a webhook token can send many concurrent large chunked requests, consuming server memory before the application-level check fires.
- Payloads slightly exceeding 1MB (in bytes) can pass validation if they contain multi-byte characters.
- The Vite/Nitro server config has no explicit body size limit, relying on framework defaults which are typically much larger than 1MB.

**Suggestion**: Replace the two-stage check with a streaming byte-count guard using `request.body` (ReadableStream), or use `Buffer.byteLength` for an accurate byte-size check on the fully-read body:

```ts
return (async () => {
  const rawBody = await request.text();

  // Use byte length for accurate size enforcement
  const byteLength = Buffer.byteLength(rawBody, "utf-8");
  if (byteLength > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "Request body too large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }
  // ... rest of handler
})();
```

For stronger protection against memory exhaustion from chunked requests without Content-Length, consider adding a Nitro server middleware that enforces a global request body size limit.

---

### [SEVERITY: LOW] Finding 3: Sign-in/sign-up forms use incorrect `from` route in `useNavigate`

**File**: `apps/web/src/routes/login.tsx:11-18` (indirectly via imported components)

**Note**: The actual issue is in `apps/web/src/components/sign-in-form.tsx:14-16` and `apps/web/src/components/sign-up-form.tsx:14-16`, which are rendered exclusively by `login.tsx`. Flagging here because the route file is in-cluster and imports these components.

**Problem**: Both form components specify `useNavigate({ from: "/" })`, but they are rendered from the `/login` route. The `from` parameter is used by TanStack Router for type-safe navigation and relative route resolution. Specifying an incorrect source route breaks the type contract.

**Evidence**:
```ts
// sign-in-form.tsx — rendered at /login, not /
const navigate = useNavigate({
  from: "/",  // incorrect — actual route is /login
});

// sign-up-form.tsx — same issue
const navigate = useNavigate({
  from: "/",  // incorrect — actual route is /login
});
```

**Impact**:
- Currently works at runtime because navigation targets use absolute paths (`to: "/dashboard"`). Relative paths would resolve incorrectly.
- Type safety is undermined: TypeScript validates params against the `/` route shape rather than `/login`.
- If route params or search params are added to `/login` in the future, this mismatch could cause silent type-unsound navigation bugs.

**Suggestion**: Change `from` to match the actual rendering route:
```ts
const navigate = useNavigate({
  from: "/login",
});
```

---

## Summary

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | MEDIUM | `routes/login.tsx` | No auth guard — authenticated users see sign-up form |
| 2 | MEDIUM | `routes/api/webhook/$token.ts` | Body-size check bypassed via chunked encoding + character-vs-byte mismatch |
| 3 | LOW | `routes/login.tsx` (via components) | `useNavigate({ from: "/" })` doesn't match actual route `/login` |

**Overall assessment**: The code is well-structured. The auth flow (middleware → server function → route guards) follows correct TanStack Start patterns. The tRPC wiring (client, context, API handler) is clean. The webhook handler has thoughtful security (timing-safe HMAC comparison, body size limits, enabled/disabled check), but the body-size enforcement has two exploitable gaps. The login page is the only route missing an auth redirect, creating an inconsistency with the rest of the application.
