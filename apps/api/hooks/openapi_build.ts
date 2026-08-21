import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import openapiConfig from '#config/openapi'
import { MetaStore } from '#services/openapi/meta_store'
import { copyScalarStandalone } from '#services/openapi/assets'
import {
  createProject,
  generateOpenApiDocument,
  loadRegistrySourceFile,
} from '#services/openapi/generator'

/**
 * Production build hook. The compiled `build/` directory ships no `tsconfig.json`,
 * no `.ts` sources and no Tuyau registry, so the OpenAPI document must be baked
 * in at build time (and the Scalar renderer asset copied into `build/public/`).
 */
export default async function openapiBuildHook() {
  const project = createProject(resolve('tsconfig.json'))
  const registry = loadRegistrySourceFile(project, resolve('.adonisjs/client/registry/schema.d.ts'))

  const document = await generateOpenApiDocument({
    config: openapiConfig,
    metaStore: new MetaStore(),
    registrySourceFile: registry,
  })

  const specPath = resolve(`build/${openapiConfig.buildSpecPath}`)
  await mkdir(dirname(specPath), { recursive: true })
  await writeFile(specPath, `${JSON.stringify(document, null, 2)}\n`)

  await copyScalarStandalone(
    resolve('node_modules/@scalar/api-reference/dist/browser/standalone.js'),
    resolve(`build/public${openapiConfig.uiAssetPath}`)
  )
}
