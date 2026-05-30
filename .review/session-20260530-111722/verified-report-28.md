# Verified Code Review Report — Cluster 28

**Verifier**: Verification Agent
**Date**: 2026-05-30
**Original Report**: review-report-28.md

---

### Finding 1: Login page allows authenticated users to access sign-up form — CONFIRMED

**Original**: No `beforeLoad` auth guard on `/login`; authenticated users see sign-up form by default.
**Verification**: Source code at `apps/web/src/routes/login.tsx` confirms:

```ts
// login.tsx:7-9 — no beforeLoad
export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

// login.tsx:12 — defaults to SignUp form (showSignIn = false)
const [showSignIn, setShowSignIn] = useState(false);
```

Compare with `index.tsx` which redirects authenticated users away, and `_authenticated.tsx` which gates access. The login page is the only public-facing route missing this guard. Confirmed as a real inconsistency.

---

### Finding 2: Webhook endpoint body-size enforcement has two gaps — CONFIRMED

**Original**: Content-Length bypass via chunked encoding + `rawBody.length` counts UTF-16 code units not bytes.
**Verification**: Source code at `apps/web/src/routes/api/webhook/$token.ts` confirms both gaps:

```ts
// Line 15-21: Gap A — Content-Length check skipped when null (chunked encoding)
const contentLength = request.headers.get("Content-Length");
if (contentLength !== null && Number(contentLength) > MAX_BODY_BYTES) {
  // rejected — but skipped entirely for chunked requests
}

// Line 23-30: Gap B — body buffered before check; .length is char count, not bytes
const rawBody = await request.text();
if (rawBody.length > MAX_BODY_BYTES) {
  // ... rejection — but already in memory, and under-counts multi-byte chars
}
```

Both gaps are confirmed. The `request.text()` returns a JS string where `.length` counts UTF-16 code units, not byte size.

---

### Finding 3: Sign-in/sign-up forms use incorrect `from` route in `useNavigate` — CONFIRMED

**Original**: Both form components use `useNavigate({ from: "/" })` but render at `/login`.
**Verification**: Source code confirms:

```ts
// sign-in-form.tsx:14-15
const navigate = useNavigate({ from: "/" });

// sign-up-form.tsx:14-15
const navigate = useNavigate({ from: "/" });
```

Both are rendered from `login.tsx` at the `/login` route. The `from` parameter should be `"/login"`. Currently works at runtime because all navigations use absolute paths (`to: "/dashboard"`), but undermines TanStack Router's type safety for route params/search params.

---

## Summary

| # | Verdict  | Severity | File | Issue |
|---|----------|----------|------|-------|
| 1 | CONFIRMED | MEDIUM | `routes/login.tsx` | No auth guard — authenticated users see sign-up form |
| 2 | CONFIRMED | MEDIUM | `routes/api/webhook/$token.ts` | Body-size check bypassed via chunked encoding + char-vs-byte mismatch |
| 3 | CONFIRMED | LOW | `sign-in-form.tsx`, `sign-up-form.tsx` | `useNavigate({ from: "/" })` doesn't match actual route `/login` |

**Result: 3 CONFIRMED, 0 DISMISSED**
