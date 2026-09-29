#!/usr/bin/env node
/**
 * Local equivalent of the GitHub Actions PR gate.
 *
 * CI's gate (`.github/workflows/ci.yml`'s `test` job, defined in the reusable
 * `test.yml`, plus its `e2e` job — see `foundational/PLAN_00_FOUNDATIONAL_PLAN.md` §12) runs, in
 * order:
 *   1. build `@everylist/shared`  — `apps/api` and `apps/web` resolve its
 *      types/runtime via the package's `exports` → `dist/`, so a fresh
 *      checkout needs it built before typecheck/tests can import it
 *   2. lint every workspace          (`pnpm -r lint`)
 *   3. typecheck every workspace     (`pnpm -r typecheck`)
 *   4. install Playwright Chromium   (web component tests run in a real browser)
 *   5. test every workspace          (`pnpm -r test`, 100% coverage gates)
 *   6. Android JVM unit tests + JaCoCo line-coverage gate (Gradle, not a
 *      pnpm workspace — needs the Android SDK + JDK 21, so it's skipped
 *      with a warning when `apps/android` can't be built here)
 *   7. Playwright E2E                (`apps/web` offline-sync + accessibility)
 *
 * This script mirrors that exact sequence so a commit can be vetted locally
 * instead of burning (at times multiple) GitHub Actions round trips.
 *
 * Not covered here (CI-only, needs Docker): the `docker-smoke` job — building
 * the production image and smoke-testing it. (Lighthouse's CI gate was
 * removed in PR #30 — `scripts/lighthouse-check.mjs` still exists for
 * manual/local runs, but nothing in CI invokes it.)
 *
 * Usage:
 *   pnpm check               # full local gate, E2E included
 *   pnpm check --skip-e2e    # lint/typecheck/unit gate only (fast iteration)
 *   pnpm check --skip-android  # skip the Android Gradle steps (no SDK/JDK 21 handy)
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const skipE2E = process.argv.includes('--skip-e2e')
const skipAndroid = process.argv.includes('--skip-android')

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * The major version of the `java` on PATH, or null when none runs. Java prints its version to
 * stderr ("openjdk version \"21.0.11\" …"); the old `1.8.0` form is normalised to `8`.
 * @returns {number | null}
 */
function detectJavaMajorVersion() {
  const result = spawnSync('java', ['-version'], { encoding: 'utf8' })
  if (result.status !== 0) return null
  const output = `${result.stderr || ''}${result.stdout || ''}`
  const match = output.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return null
  const major = Number(match[1])
  // `1.8.0_392` style: the real major is the second component.
  return major === 1 && match[2] ? Number(match[2]) : major
}

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

// Android is a Gradle project, not a pnpm workspace, so it needs the Android SDK + JDK 21 that
// this step can't assume. Run it when the SDK is discoverable and java is new enough; otherwise
// print how to run it by hand rather than failing the whole gate on a toolchain CI always has.
if (!skipAndroid) {
  steps.push({
    label: 'Android JVM unit tests + coverage gate',
    cmd: [
      join(repoRoot, 'apps/android/gradlew'),
      ':app:jacocoTestReport',
      ':app:compileDebugAndroidTestJavaWithJavac',
      '--no-daemon'
    ],
    cwd: join(repoRoot, 'apps/android'),
    android: true
  })
}

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

  if (step.android) {
    const sdkPresent =
      !!(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) ||
      existsSync(join(process.env.HOME || '', 'Library/Android/sdk')) ||
      existsSync(join(process.env.HOME || '', 'Android/Sdk'))
    // AGP 8.13 needs JDK 17+; CI pins 21. Parse the major version rather than accepting any
    // `java` (a JDK 8/11 would pass a bare status check and then fail Gradle confusingly).
    const javaMajor = detectJavaMajorVersion()
    if (!sdkPresent || javaMajor === null || javaMajor < 17) {
      console.log(`\n===== ${header} — SKIPPED =====`)
      const javaNote =
        javaMajor === null ? 'no working `java` found' : `found JDK ${javaMajor} (need 17+)`
      console.log(
        `Skipping Android step: ${javaNote}${sdkPresent ? '' : ', no Android SDK found'}.`
      )
      console.log(
        'CI runs this step; to run it here, install the Android SDK + JDK 21 and set ANDROID_HOME'
      )
      console.log('(or put the SDK at ~/Library/Android/sdk).')
      continue
    }
  }

  console.log(`\n===== ${header} =====\n`)
  const result = spawnSync(step.cmd[0], step.cmd.slice(1), {
    stdio: 'inherit',
    cwd: step.cwd
  })
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
  'Not covered here: the CI docker-smoke job (production Docker image build + smoke test) — it needs Docker.'
)
process.exit(0)
