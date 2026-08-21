import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { BaseCommand, flags } from '@adonisjs/core/ace'
import openapiConfig from '#config/openapi'
import { MetaStore } from '#services/openapi/meta_store'
import {
  createProject,
  generateOpenApiDocument,
  loadRegistrySourceFile,
} from '#services/openapi/generator'

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
