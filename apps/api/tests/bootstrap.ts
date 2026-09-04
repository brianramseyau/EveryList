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
  // Root cause of that same "Invalid URL" error recurring deterministically in
  // CI (confirmed by bisecting Node versions locally, same OS: clean on
  // 24.18.1, reproduces 100% on 24.20.0): Node 24.20.0's loader changes
  // (nodejs/node#63917 "enforce path normalization before lookup", alongside
  // #62239's package-maps work) break the .ts-to-.js specifier rewrite
  // FsLoader's command scan relies on to dynamically import each
  // apps/api/commands/*.ts file. CI is now pinned off 24.20.0 (see
  // .github/actions/setup/action.yml) specifically to avoid this. Production
  // isn't at risk regardless of Node patch — docker/root/etc/cont-init.d's
  // migrate/demo-seed scripts run the pre-compiled build/ace.js output, so
  // there's no .ts file for this loader trick to resolve.
  //
  // The catch below is defense-in-depth on top of that pin, not the fix
  // itself: this warm-up boot only exists to close the race described
  // above, so if the *same known* error slips through again (e.g. someone
  // bumps the pin before ace/Node actually fix it), don't let it take the
  // whole run down — migration:run's own loader registers ahead of the
  // commands/ FsLoader that's throwing, so exec() below still finds it, and
  // the original (rare) race is a better failure mode than a 15-minute
  // hang. Any *other* error is rethrown — this isn't a general-purpose
  // "ignore boot failures" catch.
  setup: [
    async () => {
      const ace = await app.container.make('ace')
      try {
        await ace.boot()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('Invalid command exported') || !message.includes('Invalid URL')) {
          throw error
        }
        console.warn('ace kernel warm-up boot hit the known demo_seed.js loader issue:', message)
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
