import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import { Project } from 'ts-morph'
import {
  generateOpenApiDocument,
  loadRegistrySourceFile,
  createProject,
} from '#services/openapi/generator'
import { MetaStore } from '#services/openapi/meta_store'
import type { OpenApiConfig } from '#services/openapi/generator'

const FIXTURE = `export interface Registry {
  'lists.items.index': {
    methods: ['GET', 'HEAD']
    pattern: '/api/v1/lists/:listId/items'
    types: {
      body: {}
      query: { includeChecked?: boolean }
      response: { data: { id: number; name: string }[] }
      errorResponse: never
    }
  }
  'lists.items.store': {
    methods: ['POST']
    pattern: '/api/v1/lists/:listId/items'
    types: {
      body: { name: string; quantity?: string | null }
      query: {}
      response: { data: { id: number } }
      errorResponse: { status: 409; response: { message: string } } | { status: 422; response: { errors: string[] } }
    }
  }
  'lists.items.destroy': {
    methods: ['DELETE']
    pattern: '/api/v1/lists/:listId/items/:itemId'
    types: {
      body: {}
      query: {}
      response: unknown
      errorResponse: never
    }
  }
  'metas.show': {
    methods: ['GET']
    pattern: '/api/v1/meta'
    types: {
      body: {}
      query: {}
      response: { version: string }
      errorResponse: never
    }
  }
}
`

function makeConfig(overrides: Partial<OpenApiConfig> = {}): OpenApiConfig {
  return {
    info: { title: 'Test API', version: '1.0.0' },
    servers: [{ url: '/' }],
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    publicRouteNames: ['metas.show'],
    exclude: [],
    endpoints: { ui: '/docs', spec: '/openapi' },
    buildSpecPath: '.adonisjs/openapi.json',
    uiAssetPath: '/docs/scalar.js',
    ...overrides,
  }
}

function makeDocument(
  config: OpenApiConfig = makeConfig(),
  metaStore = new MetaStore(),
  fixture = FIXTURE
) {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('schema.d.ts', fixture)
  return generateOpenApiDocument({ config, metaStore, registrySourceFile: sourceFile })
}

const DEGENERATE_FIXTURE = `export interface Registry {
  'broken.no-types': {
    methods: ['GET']
    pattern: '/api/v1/no-types'
  }
  'broken.no-methods': {
    pattern: '/api/v1/no-methods'
    types: { body: {}; query: {}; response: {}; errorResponse: never }
  }
  'broken.no-pattern': {
    methods: ['GET']
    types: { body: {}; query: {}; response: {}; errorResponse: never }
  }
  'broken.not-literal': string
  'broken.bad-error': {
    methods: ['POST']
    pattern: '/api/v1/bad-error'
    types: {
      body: {}
      query: {}
      response: {}
      errorResponse: { status: 500; response: { message: string } } | { foo: string } | { status: string; response: {} }
    }
  }
  'ping': {
    methods: ['GET']
    pattern: '/api/v1/ping'
    types: { body: {}; query: {}; response: { pong: boolean }; errorResponse: never }
  }
}
`

test.group('generateOpenApiDocument', () => {
  test('builds the document skeleton from the registry', ({ assert }) => {
    const doc = makeDocument()

    assert.equal(doc.openapi, '3.1.0')
    assert.equal(doc.info.title, 'Test API')
    assert.deepEqual(doc.security, [{ bearerAuth: [] }])
    assert.deepEqual(Object.keys(doc.components!.securitySchemes!), ['bearerAuth'])
    assert.deepEqual(Object.keys(doc.paths!), [
      '/api/v1/lists/{listId}/items',
      '/api/v1/lists/{listId}/items/{itemId}',
      '/api/v1/meta',
    ])
  })

  test('turns route params into path parameters and skips the HEAD method', ({ assert }) => {
    const doc = makeDocument()
    const get = doc.paths!['/api/v1/lists/{listId}/items']!.get!

    assert.isUndefined(doc.paths!['/api/v1/lists/{listId}/items']!.head)
    assert.deepEqual(get.parameters, [
      { name: 'listId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'includeChecked', in: 'query', required: false, schema: { type: 'boolean' } },
    ])
  })

  test('builds a request body from a validated body type', ({ assert }) => {
    const doc = makeDocument()
    const post = doc.paths!['/api/v1/lists/{listId}/items']!.post!

    assert.deepEqual(post.requestBody, {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: ['string', 'null'] },
            },
            required: ['name'],
          },
        },
      },
    })
  })

  test('omits the request body for a DELETE with an empty body type', ({ assert }) => {
    const doc = makeDocument()
    const destroy = doc.paths!['/api/v1/lists/{listId}/items/{itemId}']!.delete!

    assert.isUndefined(destroy.requestBody)
    assert.deepEqual(destroy.responses, { 204: { description: 'No content' } })
  })

  test('maps error response unions into per-status responses', ({ assert }) => {
    const doc = makeDocument()
    const post = doc.paths!['/api/v1/lists/{listId}/items']!.post!

    assert.deepEqual(Object.keys(post.responses!), ['200', '409', '422'])
    assert.deepEqual(post.responses!['409'], {
      description: 'Error response',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { message: { type: 'string' } },
            required: ['message'],
          },
        },
      },
    })
  })

  test('applies bearer security to non-public routes only', ({ assert }) => {
    const doc = makeDocument()

    assert.deepEqual(doc.paths!['/api/v1/lists/{listId}/items']!.get!.security, [
      { bearerAuth: [] },
    ])
    assert.deepEqual(doc.paths!['/api/v1/meta']!.get!.security, [])
  })

  test('treats a prefix entry as a public-route prefix', ({ assert }) => {
    const doc = makeDocument(makeConfig({ publicRouteNames: ['lists.'] }))

    assert.deepEqual(doc.paths!['/api/v1/lists/{listId}/items']!.get!.security, [])
    assert.deepEqual(doc.paths!['/api/v1/meta']!.get!.security, [{ bearerAuth: [] }])
  })

  test('excludes paths matched by a string entry', ({ assert }) => {
    const doc = makeDocument(makeConfig({ exclude: ['/api/v1/meta'] }))

    assert.deepEqual(Object.keys(doc.paths!), [
      '/api/v1/lists/{listId}/items',
      '/api/v1/lists/{listId}/items/{itemId}',
    ])
  })

  test('excludes paths matched by a regex entry', ({ assert }) => {
    const doc = makeDocument(makeConfig({ exclude: [/\/meta$/] }))

    assert.deepEqual(Object.keys(doc.paths!), [
      '/api/v1/lists/{listId}/items',
      '/api/v1/lists/{listId}/items/{itemId}',
    ])
  })

  test('merges a meta store override over the generated operation', ({ assert }) => {
    const metaStore = new MetaStore()
    metaStore.set('metas.show', { summary: 'Custom summary', tags: ['Meta'] })

    const doc = makeDocument(makeConfig(), metaStore)
    const show = doc.paths!['/api/v1/meta']!.get!

    assert.equal(show.summary, 'Custom summary')
    assert.deepEqual(show.tags, ['Meta'])
    assert.equal(show.operationId, 'metas.show')
  })

  test('skips malformed registry entries defensively', ({ assert }) => {
    const doc = makeDocument(makeConfig(), new MetaStore(), DEGENERATE_FIXTURE)

    assert.deepEqual(Object.keys(doc.paths!), [
      '/api/v1/no-types',
      '/api/v1/bad-error',
      '/api/v1/ping',
    ])
  })
})

test.group('project loading', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const registryPath = fileURLToPath(
    new URL('../../../.adonisjs/client/registry/schema.d.ts', import.meta.url)
  )

  test('loadRegistrySourceFile adds a file from disk when not already loaded', ({ assert }) => {
    const project = new Project()
    const sourceFile = loadRegistrySourceFile(project, registryPath)

    assert.isDefined(sourceFile.getInterface('Registry'))
  })

  test('createProject loads the app tsconfig and finds the registry', ({ assert }) => {
    const project = createProject(`${root}/tsconfig.json`)
    const sourceFile = loadRegistrySourceFile(project, registryPath)

    assert.isDefined(sourceFile.getInterface('Registry'))
  })
})
