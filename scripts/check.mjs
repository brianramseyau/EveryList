#!/usr/bin/env node
/**
 * Local equivalent of the GitHub Actions PR gate.
 *
 * CI's gate (`.github/workflows/ci.yml`'s `test` job, defined in the reusable
 * `test.yml`, plus its `e2e` job — see `foundational/PLAN.md` §12) runs, in
 * order:
 *   1. build `@everylist/shared`  — `apps/api` and `apps/web` resolve its
 *      types/runtime via the package's `exports` → `dist/`, so a fresh
 *      checkout needs it built before typecheck/tests can import it
 *   2. lint every workspace          (`pnpm -r lint`)
 *   3. typecheck every workspace     (`pnpm -r typecheck`)
 *   4. install Playwright Chromium   (web component tests run in a real browser)
 *   5. test every workspace          (`pnpm -r test`, 100% coverage gates)
 *   6. Playwright E2E                (`apps/web` offline-sync + accessibility)
 *
 * This script mirrors that exact sequence so a commit can be vetted locally
 * instead of burning (at times multiple) GitHub Actions round trips.
 *
 * Not covered here (CI-only, needs Docker): the `docker-smoke` job — building
 * the production image, smoke-testing it, and the Lighthouse audit.
 *
 * Usage:
 *   pnpm check               # full local gate, E2E included
 *   pnpm check --skip-e2e    # lint/typecheck/unit gate only (fast iteration)
 */

import { spawnSync } from 'node:child_process'

const skipE2E = process.argv.includes('--skip-e2e')

const steps = [
  {
    label: 'Build @everylist/shared',
    cmd: ['pnpm', '--filter', '@everylist/shared', 'build']
  },
  {
    label: 'Lint every workspace',
    cmd: ['pnpm', '-r', 'lint']
  },
  {
    label: 'Typecheck every workspace',
    cmd: ['pnpm', '-r', 'typecheck']
  },
  {
    // CI uses `install --with-deps chromium` because its runner is a bare
    // Ubuntu container. Locally system libraries are usually already
    // present (and `--with-deps` wants sudo/apt), so a plain install —
    // a fast no-op when the browser is already downloaded — is enough.
    label: 'Install Playwright Chromium (web component tests)',
    cmd: ['pnpm', '--filter', '@everylist/web', 'exec', 'playwright', 'install', 'chromium']
  },
  {
    label: 'Test every workspace (100% coverage gates)',
    cmd: ['pnpm', '-r', 'test']
  }
]

if (!skipE2E) {
  steps.push({
    label: 'Playwright E2E (offline sync, accessibility)',
    cmd: ['pnpm', '--filter', '@everylist/web', 'test:e2e']
  })
}

console.log('Running the EveryList PR gate locally…')

let failure = null
for (const [index, step] of steps.entries()) {
  const header = `[${index + 1}/${steps.length}] ${step.label}`
  console.log(`\n===== ${header} =====\n`)
  const result = spawnSync(step.cmd[0], step.cmd.slice(1), { stdio: 'inherit' })
  if (result.status !== 0) {
    failure = header
    break
  }
}

if (failure) {
  console.error(`\n===== FAILED: ${failure} =====`)
  console.error('Fix the failure above, then re-run `pnpm check`.')
  process.exit(1)
}

console.log('\n===== All local gate steps passed =====')
console.log(
  'Not covered here: the CI docker-smoke job (production Docker image build + smoke test + Lighthouse) — it needs Docker.'
)
process.exit(0)
