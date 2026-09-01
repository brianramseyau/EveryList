import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import openapiConfig from '#config/openapi'

// Deliberately not imported at module scope, matching #providers/openapi_provider's
// own comment on this: resolving *any* command that only lives in ./commands
// (this one included) makes AdonisJS's ace Kernel eagerly import every file
// in that directory to build its command metadata (see
// @adonisjs/core/build/create_kernel-*.js — it only skips that scan when the
// requested command is already found via a package loader, e.g. Lucid's
// migration:* commands). A top-level import of the ts-morph-backed generator
// here would then run for *any* ./commands invocation, including ones with
// nothing to do with OpenAPI — and crash in production, where ts-morph (a
// devDependency) isn't installed. Loading it inside run() keeps that import
// scoped to an actual `node ace openapi:generate` invocation.

/**
 * Generates the OpenAPI document from the Tuyau registry and writes it to a
 * file. Run by the production build hook and available for local inspection:
 *
 *   node ace openapi:generate --destination openapi.json
 */
export default class OpenApiGenerate extends BaseCommand {
  static commandName = 'openapi:generate'
  static description = 'Generate the OpenAPI spec from the Tuyau registry'

  @flags.string({ description: 'Destination file', default: 'openapi.json' })
  declare destination: string

  async run() {
    const { MetaStore } = await import('#services/openapi/meta_store')
    const { createProject, generateOpenApiDocument, loadRegistrySourceFile } =
      await import('#services/openapi/generator')

    const project = createProject(this.app.makePath('tsconfig.json'))
    const registry = loadRegistrySourceFile(
      project,
      this.app.makePath('.adonisjs/client/registry/schema.d.ts')
    )

    const document = await generateOpenApiDocument({
      config: openapiConfig,
      metaStore: new MetaStore(),
      registrySourceFile: registry,
    })

    await mkdir(dirname(this.destination), { recursive: true })
    await writeFile(this.destination, `${JSON.stringify(document, null, 2)}\n`)

    this.logger.success(`OpenAPI spec written to ${this.destination}`)
  }
}
