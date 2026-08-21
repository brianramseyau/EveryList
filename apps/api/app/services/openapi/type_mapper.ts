import type { OpenAPIV3_1 } from 'openapi-types'

/**
 * Minimal structural view of a TypeScript type. The real implementation
 * wraps a ts-morph `Type` (see `generator.ts`), while unit tests supply plain
 * fakes — keeping this mapper free of any ts-morph dependency.
 */
export interface TypeLike {
  isString(): boolean
  isNumber(): boolean
  isBoolean(): boolean
  isUndefined(): boolean
  isNull(): boolean
  isAny(): boolean
  isUnknown(): boolean
  isLiteral(): boolean
  isBooleanLiteral(): boolean
  isEnum(): boolean
  isArray(): boolean
  isUnion(): boolean
  isIntersection(): boolean
  isObject(): boolean
  isNever(): boolean
  getLiteralValue(): string | number | undefined
  getArrayElementType(): TypeLike | undefined
  getUnionTypes(): TypeLike[]
  getProperties(): PropertyLike[]
}

export interface PropertyLike {
  name: string
  optional: boolean
  type: TypeLike
}

function isVoidMember(type: TypeLike): boolean {
  return type.isUndefined() || type.isNull()
}

function hasUndefinedMember(type: TypeLike): boolean {
  return type.isUnion() && type.getUnionTypes().some((member) => member.isUndefined())
}

function isNullable(type: TypeLike): boolean {
  return type.isUnion() && type.getUnionTypes().some((member) => member.isNull())
}

function dedupeSchemas(schemas: OpenAPIV3_1.SchemaObject[]): OpenAPIV3_1.SchemaObject[] {
  const seen = new Set<string>()
  const result: OpenAPIV3_1.SchemaObject[] = []
  for (const schema of schemas) {
    const key = JSON.stringify(schema)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(schema)
  }
  return result
}

/**
 * Expresses nullability using OpenAPI 3.1's `type: ['x', 'null']` form
 * (the `nullable` keyword was removed in 3.1).
 */
function withNull(schema: OpenAPIV3_1.SchemaObject): OpenAPIV3_1.SchemaObject {
  if (typeof schema.type === 'string') {
    return { ...schema, type: [schema.type, 'null'] }
  }
  return { anyOf: [schema, { type: 'null' }] }
}

/**
 * Converts an object-like type into an OpenAPI object schema, walking each
 * property recursively. Properties typed `X | undefined` (or marked optional)
 * are excluded from the `required` list.
 */
export function objectToSchema(type: TypeLike): OpenAPIV3_1.SchemaObject {
  const properties: Record<string, OpenAPIV3_1.SchemaObject> = {}
  const required: string[] = []

  for (const prop of type.getProperties()) {
    if (prop.type.isNever() || prop.type.isUndefined()) continue
    properties[prop.name] = typeToSchema(prop.type)
    if (!prop.optional && !hasUndefinedMember(prop.type)) {
      required.push(prop.name)
    }
  }

  const schema: OpenAPIV3_1.SchemaObject = { type: 'object', properties }
  if (required.length > 0) schema.required = required
  return schema
}

/**
 * Maps a resolved TypeScript type to an OpenAPI 3.1 schema object.
 * Unresolvable/`any`/`unknown` types degrade to an empty schema rather than
 * failing the whole document.
 */
export function typeToSchema(type: TypeLike): OpenAPIV3_1.SchemaObject {
  if (type.isUnion()) {
    const members = type.getUnionTypes()
    const nonVoid = members.filter((member) => !isVoidMember(member))
    const nullable = isNullable(type)

    if (nonVoid.length === 0) {
      return nullable ? { type: 'null' } : {}
    }

    const schemas = dedupeSchemas(nonVoid.map((member) => typeToSchema(member)))
    const first = schemas[0]
    if (schemas.length === 1 && first) {
      return nullable ? withNull(first) : first
    }

    const unionSchemas = nullable ? [...schemas, { type: 'null' as const }] : schemas
    return { oneOf: unionSchemas }
  }

  if (type.isArray()) {
    const element = type.getArrayElementType()
    return { type: 'array', items: element ? typeToSchema(element) : {} }
  }

  if (type.isBoolean() || type.isBooleanLiteral()) return { type: 'boolean' }
  if (type.isString()) return { type: 'string' }
  if (type.isNumber()) return { type: 'number' }
  if (type.isEnum()) return { type: 'string' }
  if (type.isLiteral()) {
    return { type: typeof type.getLiteralValue() === 'number' ? 'number' : 'string' }
  }
  if (type.isNever()) return {}
  if (type.isObject() || type.isIntersection()) return objectToSchema(type)

  return {}
}

/**
 * Maps a resolved query type into OpenAPI `in: query` parameters.
 */
export function typeToParameters(
  type: TypeLike,
  location: 'query' | 'path'
): OpenAPIV3_1.ParameterObject[] {
  if (!type.isObject() || type.getProperties().length === 0) return []

  return type
    .getProperties()
    .filter((prop) => !prop.type.isNever() && !prop.type.isUndefined())
    .map((prop) => ({
      name: prop.name,
      in: location,
      required: !prop.optional && !hasUndefinedMember(prop.type),
      schema: typeToSchema(prop.type),
    })) as OpenAPIV3_1.ParameterObject[]
}
