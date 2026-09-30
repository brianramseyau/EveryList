import type { HttpContext } from '@adonisjs/core/http'

/**
 * Binds the HTTP request's auth into the MCP tool/resource/prompt context
 * (@jrmc/adonis-mcp's docs' "Setting up Authentication and Bouncer" step, minus the unused
 * Bouncer half — this app authorizes through ListPolicy, see app/policies/list_policy.ts).
 * The package's HttpTransport copies `ctx.auth` into the MCP context only when the property
 * exists on the merged type (`'auth' in ctx`), so without this declaration tools would see no
 * user at all even though the route runs middleware.auth({ guards: ['pat'] }). Only `auth`
 * is declared because bouncer was never registered (adonisrc.ts notes why).
 */
declare module '@jrmc/adonis-mcp/types/context' {
  export interface McpContext {
    auth: HttpContext['auth']
  }
}
