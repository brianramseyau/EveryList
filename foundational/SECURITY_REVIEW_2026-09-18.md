# Security Review: EveryList (2026-09-18)

**Scope:** `apps/api` (AdonisJS 6), `apps/web` (SvelteKit), `packages/shared`. Priority given to authorization/IDOR (multi-user list sharing), the new Personal Access Token and "Sign in with Home Assistant" auth surfaces, SSRF, injection, file handling, secrets/crypto, and CSRF/CORS.

## Summary

- **Findings:** 0 Critical / 0 High / 0 Medium / 0 Low high-confidence vulnerabilities
- **Risk Level:** Low
- **Confidence:** High

No exploitable, attacker-controlled vulnerabilities were identified. The codebase consistently applies a single authorization choke point, uses parameterized queries throughout, validates file paths against allowlists, and generates tokens with `randomBytes`. Below is what was verified and the residual items worth tracking.

---

## What was verified clean

| Area                             | Verification                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IDOR / authorization**         | Every list/item/category/store/member/invite controller routes through `ListPolicy.requireList`/`requireStoreRole` (`apps/api/app/policies/list_policy.ts`), and child-resource lookups are additionally scoped by `listId` so a valid-but-foreign id 404s instead of leaking data. `items_controller.ts#moveToList` re-checks `editor` role on the _destination_ list.                    |
| **HA SSO (implicit + auth_api)** | `ha_auth_controller.ts` trusts `X-Remote-User-*` headers only after `isGenuineIngressRequest` checks the raw **socket IP** (not a spoofable header) against Home Assistant Supervisor's fixed proxy address. No `trustProxy` config exists, so `X-Forwarded-For` can't be used to fake the source IP. Explicit login still requires a real password check against Supervisor's `auth_api`. |
| **Personal Access Tokens**       | Minting requires `owner` role on every listed list; a PAT cannot mint another PAT; grants are re-validated against current membership on use (`ListPolicy.effectiveRole`), so a stale token can't outlive a permission downgrade.                                                                                                                                                          |
| **SSRF**                         | All outbound requests target hardcoded/server-config URLs (`http://supervisor/auth`, Authentik/Alexa config) — no user-controlled destination found.                                                                                                                                                                                                                                       |
| **Injection**                    | No raw SQL with interpolated input; `whereRaw` calls use bound parameters. No `exec`/`execSync`/`eval`/`new Function` on user input outside test files.                                                                                                                                                                                                                                    |
| **File handling**                | Backup download filename is validated against an anchored regex before `path.join` (no traversal). Alexa icon params are allowlist-validated.                                                                                                                                                                                                                                              |
| **Secrets/crypto**               | No hardcoded secrets, no MD5/SHA1 for security use, tokens use `randomBytes(24)`, PATs use AdonisJS's hashed-token verification.                                                                                                                                                                                                                                                           |
| **CSRF/CORS**                    | Shield's CSRF is disabled, but no route uses the session/cookie guard for state-changing calls — all use bearer-token guards, so there's no ambient credential for CSRF to ride on. CORS restricts production origins to the Capacitor/Electron loopback patterns actually used.                                                                                                           |

## Needs Verification / follow-up (non-blocking)

1. **Timing side-channel in secret comparison** — `alexa_oauth_controller.ts#token` compares client secrets with `!==` instead of a constant-time comparison. Theoretical only, impractical over a network, and consistent with other framework-level comparisons in the app. Not action-required, but a cheap swap to `crypto.timingSafeEqual` if touching that file anyway.
2. **HA ingress IP trust depends on deployment topology** — the `172.30.32.2` socket-IP check for genuine ingress requests is sound in the standard HA Supervisor topology, but would need re-verification if a user runs the add-on behind an additional reverse proxy that rewrites the peer IP AdonisJS sees. This is a deployment question, not a code defect — worth a live check in the actual add-on environment rather than further static reading.

## Actionable plan

- [ ] No code changes required from this review.
- [ ] Optional hardening: switch the Alexa OAuth client-secret comparison to constant-time (`crypto.timingSafeEqual`) next time that file is touched — low priority, bundle with unrelated work rather than a standalone PR.
- [ ] Manually confirm the HA ingress IP check still resolves correctly if/when testing the add-on behind any non-standard reverse-proxy setup.
