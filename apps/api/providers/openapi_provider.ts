import { readFile, access } from 'node:fs/promises'
import { Route } from '@adonisjs/core/http'
import type { ApplicationService } from '@adonisjs/core/types'
import type { OpenAPIV3_1 } from 'openapi-types'
import openapiConfig from '#config/openapi'
import { MetaStore } from '#services/openapi/meta_store'
import { copyScalarStandalone } from '#services/openapi/assets'

/**
 * Shared metadata store for the `Route.openapi()` macro. Registered routes may
 * annotate their operation (tags/summary/description) and it is merged over
 * the auto-generated operation.
 */
const metaStore = new MetaStore()

Route.macro('openapi', function (this: Route, operation: OpenAPIV3_1.OperationObject) {
  const name = this.getName()
  if (name) metaStore.set(name, operation)
  return this
})

declare module '@adonisjs/core/http' {
  interface Route {
    openapi: (operation: OpenAPIV3_1.OperationObject) => this
  }
}

export default class OpenApiProvider {
  #cachedSpec: string | null = null

  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    if (this.app.inDev) {
      await this.#ensureScalarAsset()
    }

    const router = await this.app.container.make('router')
    const { ui, spec } = openapiConfig.endpoints

    router.get(spec, async ({ response }) => {
      return response.type('application/json').send(await this.#spec())
    })

    router.get(ui, async ({ response }) => {
      return response.type('html').send(this.#renderUi())
    })
  }

  async #spec(): Promise<string> {
    if (this.#cachedSpec) return this.#cachedSpec

    if (this.app.inProduction) {
      const file = this.app.makePath(openapiConfig.buildSpecPath)
      this.#cachedSpec = await readFile(file, 'utf-8')
      return this.#cachedSpec
    }

    // Loaded lazily so the ts-morph-backed generator (a dev-only dependency)
    // is never imported in the production runtime, which serves the spec
    // baked into the build instead.
    const { createProject, generateOpenApiDocument, loadRegistrySourceFile } =
      await import('#services/openapi/generator')
    const project = createProject(this.app.makePath('tsconfig.json'))
    const registry = loadRegistrySourceFile(
      project,
      this.app.makePath('.adonisjs/client/registry/schema.d.ts')
    )

    const document = await generateOpenApiDocument({
      config: openapiConfig,
      metaStore,
      registrySourceFile: registry,
    })

    this.#cachedSpec = JSON.stringify(document)
    return this.#cachedSpec
  }

  #renderUi(): string {
    const { title } = openapiConfig.info
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — API Reference</title>
  </head>
  <body>
    <script id="api-reference" data-url="${openapiConfig.endpoints.spec}"></script>
    <script src="${openapiConfig.uiAssetPath}"></script>
  </body>
</html>`
  }

  async #ensureScalarAsset(): Promise<void> {
    const from = this.app.makePath('node_modules/@scalar/api-reference/dist/browser/standalone.js')
    const to = this.app.makePath(`public${openapiConfig.uiAssetPath}`)

    try {
      await access(to)
    } catch {
      await copyScalarStandalone(from, to)
    }
  }
}
