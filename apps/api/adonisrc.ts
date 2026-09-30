import { indexEntities } from '@adonisjs/core'
import { defineConfig } from '@adonisjs/core/app'
import { generateRegistry } from '@tuyau/core/hooks'

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Experimental flags
  |--------------------------------------------------------------------------
  |
  | The following features will be enabled by default in the next major release
  | of AdonisJS. You can opt into them today to avoid any breaking changes
  | during upgrade.
  |
  */
  experimental: {},

  /*
  |--------------------------------------------------------------------------
  | Commands
  |--------------------------------------------------------------------------
  |
  | List of ace commands to register from packages. The application commands
  | will be scanned automatically from the "./commands" directory.
  |
  */
  commands: [
    () => import('@adonisjs/core/commands'),
    () => import('@adonisjs/lucid/commands'),
    () => import('@adonisjs/session/commands'),
    // mcp:start (stdio), mcp:inspector, make:mcp-{tool,resource,prompt} — see
    // foundational/PLAN_32_PHASE_MCP_SERVER.md. mcp:start is dev-tools only (stdio has no
    // HttpContext, so tools see no authenticated user — HTTP transport is the supported path).
    () => import('@jrmc/adonis-mcp/commands'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Service providers
  |--------------------------------------------------------------------------
  |
  | List of service providers to import and register when booting the
  | application
  |
  */
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/hash_provider'),
    {
      file: () => import('@adonisjs/core/providers/repl_provider'),
      environment: ['repl', 'test'],
    },
    () => import('@adonisjs/core/providers/vinejs_provider'),
    () => import('@adonisjs/session/session_provider'),
    () => import('@adonisjs/shield/shield_provider'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/cors/cors_provider'),
    () => import('@adonisjs/auth/auth_provider'),
    () => import('@adonisjs/mail/mail_provider'),
    () => import('#providers/api_provider'),
    () => import('#providers/openapi_provider'),
    () => import('@adonisjs/static/static_provider'),
    () => import('@adonisjs/transmit/transmit_provider'),
    () => import('@adonisjs/limiter/limiter_provider'),
    // Defines router.mcp() (in its start() hook, which runs before the #start/routes preload)
    // and scans app/mcp/{tools,resources,prompts}. Registered in the package's start() hook —
    // not boot() — is exactly why router.mcp() is safe to call from routes.ts (see
    // foundational/PLAN_32_PHASE_MCP_SERVER.md).
    () => import('@jrmc/adonis-mcp/mcp_provider'),
    // Adds McpRequest.validateUsing(...) so tool schemas can be VineJS validators. The package's
    // optional `bouncer` peer is deliberately NOT registered: this app authorizes through
    // ListPolicy (see app/policies/list_policy.ts), not Bouncer.
    () => import('@jrmc/adonis-mcp/vinejs_provider'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Preloads
  |--------------------------------------------------------------------------
  |
  | List of modules to import before starting the application.
  |
  */
  preloads: [
    () => import('#start/kernel'),
    () => import('#start/validator'),
    () => import('#start/server_config'),
    // #start/transmit is intentionally NOT listed here — see the import at the
    // top of #start/routes for why.
    () => import('#start/routes'),
    () => import('#start/backup_scheduler'),
    () => import('#start/pruner_scheduler'),
    () => import('#start/deadline_notification_scheduler'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Tests
  |--------------------------------------------------------------------------
  |
  | List of test suites to organize tests by their type. Feel free to remove
  | and add additional suites.
  |
  */
  tests: {
    suites: [
      {
        files: ['tests/unit/**/*.spec.{ts,js}'],
        name: 'unit',
        timeout: 2000,
      },
      {
        files: ['tests/functional/**/*.spec.{ts,js}'],
        name: 'functional',
        timeout: 30000,
      },
    ],
    forceExit: false,
  },

  /*
  |--------------------------------------------------------------------------
  | Metafiles
  |--------------------------------------------------------------------------
  |
  | A collection of files you want to copy to the build folder when creating
  | the production build.
  |
  */
  metaFiles: [
    {
      pattern: 'public/**',
      reloadServer: false,
    },
  ],

  hooks: {
    init: [
      indexEntities({
        transformers: { enabled: true },
      }),
      generateRegistry(),
    ],
    buildFinished: [() => import('./hooks/openapi_build.js')],
  },
})
