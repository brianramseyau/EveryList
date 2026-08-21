import {
  Node,
  Project,
  SyntaxKind,
  type PropertySignature,
  type SourceFile,
  type Type,
  type TypeElementTypes,
  type TypeLiteralNode,
} from 'ts-morph'
import type { OpenAPIV3_1 } from 'openapi-types'
import { typeToSchema, typeToParameters, type PropertyLike, type TypeLike } from './type_mapper.js'
import type { MetaStore } from './meta_store.js'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
type HttpVerb = (typeof HTTP_METHODS)[number]

/**
 * Configuration for the OpenAPI documentation generation and the `/docs` UI.
 *
 * Lives in `config/openapi.ts` and is consumed by the generator (document
 * metadata), the provider (route/endpoint wiring) and the build hook (baking
 * the spec into the production build).
 */
export interface OpenApiConfig {
  /** OpenAPI `info` section. */
  info: OpenAPIV3_1.InfoObject
  /** OpenAPI `servers` section. Relative URLs resolve against the serving host. */
  servers: OpenAPIV3_1.ServerObject[]
  /** Named security schemes (referenced by route security requirements). */
  securitySchemes: Record<string, OpenAPIV3_1.SecuritySchemeObject>
  /**
   * Route names exempt from authentication. An entry matches a route when it
   * is either an exact route name (e.g. `metas.show`) or a prefix ending in
   * `.` (e.g. `auth.` matches `auth.new_account.store`).
   */
  publicRouteNames: string[]
  /** Paths to omit from the generated document. */
  exclude: Array<string | RegExp>
  /** Where the UI and raw spec are served. */
  endpoints: { ui: string; spec: string }
  /** Path (relative to the app root) of the spec baked into the prod build. */
  buildSpecPath: string
  /** URL path of the vendored Scalar renderer asset (served from `public/`). */
  uiAssetPath: string
}

/**
 * Adapts a ts-morph `Type` to the `TypeLike` interface consumed by the pure
 * mapper in `type_mapper.ts`. Property types are resolved via
 * `getTypeAtLocation` against the originating type node, which is how
 * instantiated helper types (`ExtractBody`, `ExtractResponse`, `Omit`, …)
 * produced by the Tuyau registry resolve to their concrete members.
 */
class TsMorphType implements TypeLike {
  constructor(
    private type: Type,
    private location: Node
  ) {}

  isString() {
    return this.type.isString()
  }

  isNumber() {
    return this.type.isNumber()
  }

  isBoolean() {
    return this.type.isBoolean()
  }

  isUndefined() {
    return this.type.isUndefined()
  }

  isNull() {
    return this.type.isNull()
  }

  isAny() {
    return this.type.isAny()
  }

  isUnknown() {
    return this.type.isUnknown()
  }

  isLiteral() {
    return this.type.isLiteral()
  }

  isBooleanLiteral() {
    return this.type.isBooleanLiteral()
  }

  isEnum() {
    return this.type.isEnum()
  }

  isArray() {
    return this.type.isArray()
  }

  isUnion() {
    return this.type.isUnion()
  }

  isIntersection() {
    return this.type.isIntersection()
  }

  isObject() {
    return this.type.isObject()
  }

  isNever() {
    return this.type.isNever()
  }

  getLiteralValue() {
    return this.type.getLiteralValue() as string | number | undefined
  }

  getArrayElementType() {
    const element = this.type.getArrayElementType()
    /* v8 ignore next -- ts-morph always resolves an element for a real array type */
    return element ? new TsMorphType(element, this.location) : undefined
  }

  getUnionTypes() {
    return this.type.getUnionTypes().map((member) => new TsMorphType(member, this.location))
  }

  getProperties(): PropertyLike[] {
    return this.type.getProperties().map((symbol) => ({
      name: symbol.getName(),
      optional: symbol.isOptional(),
      type: new TsMorphType(symbol.getTypeAtLocation(this.location), this.location),
    }))
  }
}

function resolveType(typeNode: Node | undefined): TsMorphType | undefined {
  if (!typeNode) return undefined
  return new TsMorphType(typeNode.getType(), typeNode)
}

function stripQuotes(name: string): string {
  return name.replace(/^['"]|['"]$/g, '')
}

function propertySignatures(members: TypeElementTypes[]): PropertySignature[] {
  return members.filter((member): member is PropertySignature => Node.isPropertySignature(member))
}

function findMember(members: PropertySignature[], name: string): PropertySignature | undefined {
  return members.find((member) => member.getName() === name)
}

function typeLiteralOf(member: PropertySignature | undefined): TypeLiteralNode | undefined {
  const typeNode = member?.getTypeNode()
  return typeNode && Node.isTypeLiteral(typeNode) ? typeNode : undefined
}

function stringLiterals(node: PropertySignature): string[] {
  return node
    .getDescendantsOfKind(SyntaxKind.StringLiteral)
    .map((literal) => literal.getLiteralValue())
}

function toVerb(method: string): HttpVerb | undefined {
  const lower = method.toLowerCase()
  return (HTTP_METHODS as readonly string[]).includes(lower) ? (lower as HttpVerb) : undefined
}

function openApiPath(pattern: string): string {
  return pattern.replace(/:(\w+)/g, '{$1}')
}

function pathParameters(pattern: string): OpenAPIV3_1.ParameterObject[] {
  const names = [...pattern.matchAll(/:(\w+)/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined)
  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }))
}

function prettify(segment: string): string {
  return segment.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Route names follow `<group>.<action>` or, for nested resources,
 * `<group>.<resource>.<action>` (e.g. `lists.items.store`). Tagging by the
 * segment immediately before the action — rather than always the leading
 * group — keeps sibling resources nested under a shared prefix (lists,
 * items, categories, favorites, members, ...) from all collapsing into one
 * flat, indistinguishable tag in the docs UI.
 */
function tagForRoute(routeName: string): string {
  const parts = routeName.split('.')
  const resource = parts.length > 1 ? parts[parts.length - 2] : parts[0]
  return prettify(resource ?? routeName)
}

/**
 * The leading segment of the route name (e.g. `lists` in `lists.items.store`)
 * — used to nest per-resource tags under a shared `x-tagGroups` section in
 * the Scalar UI, so `Items`/`Categories`/`Favorite Items`/... all collapse
 * under a single "Lists" heading instead of sitting as top-level siblings.
 */
function tagGroupForRoute(routeName: string): string {
  return prettify(routeName.split('.')[0] ?? routeName)
}

function summaryForRoute(routeName: string): string {
  const action = routeName.slice(routeName.lastIndexOf('.') + 1)
  return action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ')
}

function isPublicRoute(routeName: string, config: OpenApiConfig): boolean {
  return config.publicRouteNames.some((entry) => {
    if (entry.endsWith('.')) return routeName.startsWith(entry)
    return routeName === entry
  })
}

function isExcluded(path: string, config: OpenApiConfig): boolean {
  return config.exclude.some((entry) =>
    typeof entry === 'string' ? entry === path : entry.test(path)
  )
}

function errorResponses(type: TsMorphType | undefined): Record<string, OpenAPIV3_1.ResponseObject> {
  if (!type) return {}

  const members = type.isUnion() ? type.getUnionTypes() : type.isObject() ? [type] : []
  const responses: Record<string, OpenAPIV3_1.ResponseObject> = {}

  for (const member of members) {
    const statusProp = member.getProperties().find((prop) => prop.name === 'status')
    const responseProp = member.getProperties().find((prop) => prop.name === 'response')
    if (!statusProp || !responseProp) continue

    const status = statusProp.type.getLiteralValue()
    if (status === undefined) continue

    responses[String(status)] = {
      description: 'Error response',
      content: { 'application/json': { schema: typeToSchema(responseProp.type) } },
    }
  }

  return responses
}

function successResponse(
  type: TsMorphType | undefined
): Record<string, OpenAPIV3_1.ResponseObject> {
  if (!type || type.isUnknown() || type.isAny()) {
    return { 204: { description: 'No content' } }
  }

  return {
    200: {
      description: 'Successful response',
      content: { 'application/json': { schema: typeToSchema(type) } },
    },
  }
}

/**
 * Generates the OpenAPI 3.1 document from the Tuyau-generated registry
 * (`schema.d.ts`) — the same single source of truth the typed client uses.
 */
export function generateOpenApiDocument(options: {
  config: OpenApiConfig
  metaStore: MetaStore
  registrySourceFile: SourceFile
}): OpenAPIV3_1.Document {
  const { config, metaStore, registrySourceFile } = options
  const registry = registrySourceFile.getInterfaceOrThrow('Registry')

  const pathItems: Record<string, Record<HttpVerb, OpenAPIV3_1.OperationObject>> = {}
  // A tag name (e.g. "Access Tokens", "Stores") can be shared by routes under
  // different top-level groups (auth vs. profile; lists vs. stores). Scalar
  // renders every tag listed in an `x-tagGroups` entry's `tags`, resolved
  // against *all* operations carrying that tag — so if the same tag were
  // added to two group entries, its operations would render twice, once per
  // group. Assigning each tag to a single group on first sight (in
  // route-registration order) keeps every tag — and its operations — nested
  // in exactly one place.
  const tagGroupOf = new Map<string, string>()
  const tagsByGroup = new Map<string, Set<string>>()

  for (const route of registry.getProperties()) {
    const routeName = stripQuotes(route.getName())
    const typeLiteral = route.getTypeNode()
    if (!Node.isTypeLiteral(typeLiteral)) continue

    const members = propertySignatures(typeLiteral.getMembers())
    const methodsNode = findMember(members, 'methods')
    const patternNode = findMember(members, 'pattern')
    const typesNode = typeLiteralOf(findMember(members, 'types'))

    const pattern = patternNode ? stringLiterals(patternNode)[0] : undefined
    if (!pattern) continue

    const path = openApiPath(pattern)
    if (isExcluded(path, config)) continue

    const typesMembers = propertySignatures(typesNode?.getMembers() ?? [])
    const bodyType = resolveType(findMember(typesMembers, 'body')?.getTypeNode())
    const queryType = resolveType(findMember(typesMembers, 'query')?.getTypeNode())
    const responseType = resolveType(findMember(typesMembers, 'response')?.getTypeNode())
    const errorType = resolveType(findMember(typesMembers, 'errorResponse')?.getTypeNode())

    const methods = methodsNode ? stringLiterals(methodsNode) : []

    for (const method of methods) {
      const verb = toVerb(method)
      if (!verb) continue

      const isBodyMethod =
        verb === 'post' || verb === 'put' || verb === 'patch' || verb === 'delete'
      const parameters: OpenAPIV3_1.ParameterObject[] = [
        ...pathParameters(pattern),
        ...(queryType ? typeToParameters(queryType, 'query') : []),
      ]

      const operation: OpenAPIV3_1.OperationObject = {
        tags: [tagForRoute(routeName)],
        operationId: routeName,
        summary: summaryForRoute(routeName),
        ...(parameters.length > 0 ? { parameters } : {}),
        ...(isBodyMethod && bodyType && bodyType.getProperties().length > 0
          ? {
              requestBody: {
                content: {
                  'application/json': { schema: typeToSchema(bodyType) },
                },
              },
            }
          : {}),
        responses: {
          ...successResponse(responseType),
          ...errorResponses(errorType),
        },
        security: isPublicRoute(routeName, config) ? [] : [{ bearerAuth: [] }],
      }

      const override = metaStore.get(routeName)
      const finalOperation = override ? { ...operation, ...override } : operation
      const item =
        pathItems[path] ?? (pathItems[path] = {} as Record<HttpVerb, OpenAPIV3_1.OperationObject>)
      item[verb] = finalOperation

      const routeGroup = tagGroupForRoute(routeName)
      for (const tag of finalOperation.tags ?? []) {
        const group = tagGroupOf.get(tag) ?? routeGroup
        tagGroupOf.set(tag, group)
        const groupTags = tagsByGroup.get(group) ?? tagsByGroup.set(group, new Set()).get(group)!
        groupTags.add(tag)
      }
    }
  }

  const xTagGroups = [...tagsByGroup.entries()].map(([name, tags]) => ({
    name,
    tags: [...tags],
  }))

  return {
    openapi: '3.1.0',
    info: config.info,
    servers: config.servers,
    paths: pathItems as unknown as OpenAPIV3_1.PathsObject,
    components: { securitySchemes: config.securitySchemes },
    security: [{ bearerAuth: [] }],
    // Scalar-specific (Redoc-style) extension: nests each resource's tag
    // under its route-group heading in the sidebar instead of listing every
    // tag as a flat top-level sibling. See tagGroupForRoute() above.
    'x-tagGroups': xTagGroups,
  } as OpenAPIV3_1.Document
}

/**
 * Creates a ts-morph project from the app's tsconfig. Used by the ace command
 * and the provider (dev on-the-fly generation).
 */
export function createProject(tsConfigFilePath: string): Project {
  return new Project({ tsConfigFilePath })
}

/**
 * Loads the Tuyau registry source file, adding it to the project on demand.
 */
export function loadRegistrySourceFile(project: Project, registryPath: string): SourceFile {
  return project.getSourceFile(registryPath) ?? project.addSourceFileAtPath(registryPath)
}
