import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import app from '@adonisjs/core/services/app'
import type { Config } from '@japa/runner/types'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import { dbAssertions } from '@adonisjs/lucid/plugins/db'
import testUtils from '@adonisjs/core/services/test_utils'
import { authApiClient } from '@adonisjs/auth/plugins/api_client'
import { sessionApiClient } from '@adonisjs/session/plugins/api_client'
import type { Registry } from '../.adonisjs/client/registry/schema.d.ts'

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */
declare module '@japa/api-client/types' {
  interface RoutesRegistry extends Registry {}
}

/**
 * This file is imported by the "bin/test.ts" entrypoint file
 */

/**
 * Configure Japa plugins in the plugins array.
 * Learn more - https://japa.dev/docs/runner-config#plugins-optional
 */
export const plugins: Config['plugins'] = [
  assert(),
  pluginAdonisJS(app),
  dbAssertions(app),
  apiClient(),
  sessionApiClient(app),
  authApiClient(app),
]

/**
 * Configure lifecycle function to run before and after all the
 * tests.
 *
 * The setup functions are executed before all the tests
 * The teardown functions are executed after all the tests
 */
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  // Resolves the shared ace kernel singleton and explicitly boots it (the
  // one-time FsLoader scan of apps/api/commands/) exactly once, before any
  // suite starts. Both the "unit" and "functional" suites below call
  // testUtils.db().migrate() in their own suite.setup(), which runs
  // kernel.exec('migration:run') against that same singleton — exec() lazily
  // triggers boot() on first use, so without forcing it here up front, two
  // suites' setups could race to boot the kernel for the first time
  // concurrently, intermittently tripping ace's command-metadata validation
  // (see the "Invalid command exported... Invalid URL" flake on
  // demo_seed.js investigated in PR history). Calling boot() directly (not
  // just make()) is what actually closes that race — make() alone only
  // constructs the Kernel instance and returns before any scan happens.
  //
  // This is a warm-up, not a load-bearing step: if it throws (seen in CI —
  // the same "Invalid command exported... Invalid URL" validation error,
  // now surfacing deterministically instead of intermittently, for reasons
  // that look environment-specific rather than related to this file), don't
  // let it take the whole run down. Swallowing it here just means the
  // original race this hook exists to close is back on the table for that
  // run, not that anything is broken outright — migration:run's own loader
  // registers ahead of the commands/ FsLoader that's actually throwing, so
  // exec() below still finds it. Letting an uncaught rejection from this
  // hook propagate instead hangs the whole process indefinitely rather than
  // failing fast (Japa's global setup doesn't turn that into a clean exit),
  // which is strictly worse than the race it's meant to prevent.
  setup: [
    async () => {
      try {
        const ace = await app.container.make('ace')
        await ace.boot()
      } catch (error) {
        console.warn('ace kernel warm-up boot failed, continuing without it:', error)
      }
    },
  ],
  teardown: [],
}

/**
 * Configure suites by tapping into the test suite instance.
 * Learn more - https://japa.dev/docs/test-suites#lifecycle-hooks
 */
export const configureSuite: Config['configureSuite'] = (suite) => {
  if (['browser', 'functional', 'e2e'].includes(suite.name)) {
    suite.setup(() => testUtils.httpServer().start())
  }

  if (['unit', 'functional'].includes(suite.name)) {
    suite.setup(() => testUtils.db().migrate())
  }
}
