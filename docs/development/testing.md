# Testing

- **Backend:** `pnpm --filter @everylist/api test` (Japa, with `c8` coverage gated at 100%)
- **Frontend:** `pnpm --filter @everylist/web test` (Vitest + Testing Library, 100% coverage gate; Playwright for E2E)
- **Shared:** `pnpm --filter @everylist/shared test` (Vitest, 100% coverage gate)
- **CLI:** `pnpm --filter @everylist/cli test` (Vitest, 100% coverage gate; every command runs against a fake API client, so no network/TTY is touched)

CI (GitHub Actions) runs lint → typecheck → tests/coverage → Docker build → E2E smoke on every PR; see [`.github/workflows`](../../.github/workflows).
