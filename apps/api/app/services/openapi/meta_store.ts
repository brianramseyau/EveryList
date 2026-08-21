import type { OpenAPIV3_1 } from 'openapi-types'

/**
 * Holds per-route OpenAPI operation overrides contributed via the
 * `Route.openapi()` macro (tags, summary, description, etc.). Populated at
 * route registration time and merged over the auto-generated operation.
 */
export class MetaStore {
  #store = new Map<string, OpenAPIV3_1.OperationObject>()

  set(routeName: string, operation: OpenAPIV3_1.OperationObject): void {
    this.#store.set(routeName, operation)
  }

  get(routeName: string): OpenAPIV3_1.OperationObject | undefined {
    return this.#store.get(routeName)
  }
}
