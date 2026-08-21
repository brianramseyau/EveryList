import { test } from '@japa/runner'
import {
  typeToSchema,
  typeToParameters,
  type PropertyLike,
  type TypeLike,
} from '#services/openapi/type_mapper'

function fake(partial: Partial<TypeLike> = {}): TypeLike {
  return {
    isString: () => false,
    isNumber: () => false,
    isBoolean: () => false,
    isUndefined: () => false,
    isNull: () => false,
    isAny: () => false,
    isUnknown: () => false,
    isLiteral: () => false,
    isBooleanLiteral: () => false,
    isEnum: () => false,
    isArray: () => false,
    isUnion: () => false,
    isIntersection: () => false,
    isObject: () => false,
    isNever: () => false,
    getLiteralValue: () => undefined,
    getArrayElementType: () => undefined,
    getUnionTypes: () => [],
    getProperties: () => [],
    ...partial,
  }
}

const string = () => fake({ isString: () => true })
const number = () => fake({ isNumber: () => true })
const boolean = () => fake({ isBoolean: () => true })
const anyType = () => fake({ isAny: () => true })
const unknownType = () => fake({ isUnknown: () => true })
const neverType = () => fake({ isNever: () => true })
const nullType = () => fake({ isNull: () => true })
const undefinedType = () => fake({ isUndefined: () => true })
const literalType = () => fake({ isLiteral: () => true })
const enumType = () => fake({ isEnum: () => true })
const arrayOf = (items: TypeLike) => fake({ isArray: () => true, getArrayElementType: () => items })
const unionOf = (types: TypeLike[]) => fake({ isUnion: () => true, getUnionTypes: () => types })

function objectOf(properties: Record<string, { optional?: boolean; type: TypeLike }>) {
  const props: PropertyLike[] = Object.entries(properties).map(([name, value]) => ({
    name,
    optional: value.optional ?? false,
    type: value.type,
  }))
  return fake({ isObject: () => true, getProperties: () => props })
}

const intersectionOf = (properties: PropertyLike[]) =>
  fake({ isIntersection: () => true, getProperties: () => properties })

test.group('typeToSchema', () => {
  test('maps primitive types', ({ assert }) => {
    assert.deepEqual(typeToSchema(string()), { type: 'string' })
    assert.deepEqual(typeToSchema(number()), { type: 'number' })
    assert.deepEqual(typeToSchema(boolean()), { type: 'boolean' })
  })

  test('maps literal and enum types to string', ({ assert }) => {
    assert.deepEqual(typeToSchema(literalType()), { type: 'string' })
    assert.deepEqual(typeToSchema(enumType()), { type: 'string' })
  })

  test('maps boolean literals to boolean', ({ assert }) => {
    const booleanLiteral = fake({ isBooleanLiteral: () => true })
    assert.deepEqual(typeToSchema(booleanLiteral), { type: 'boolean' })
  })

  test('maps a numeric literal to number', ({ assert }) => {
    assert.deepEqual(typeToSchema(fake({ isLiteral: () => true, getLiteralValue: () => 42 })), {
      type: 'number',
    })
  })

  test('maps a boolean literal union to boolean', ({ assert }) => {
    const trueLiteral = fake({ isBooleanLiteral: () => true })
    const falseLiteral = fake({ isBooleanLiteral: () => true })
    assert.deepEqual(typeToSchema(unionOf([trueLiteral, falseLiteral])), { type: 'boolean' })
  })

  test('degrades any/unknown/never to an empty schema', ({ assert }) => {
    assert.deepEqual(typeToSchema(anyType()), {})
    assert.deepEqual(typeToSchema(unknownType()), {})
    assert.deepEqual(typeToSchema(neverType()), {})
  })

  test('maps arrays with their element schema', ({ assert }) => {
    assert.deepEqual(typeToSchema(arrayOf(string())), { type: 'array', items: { type: 'string' } })
  })

  test('maps an array with no resolvable element to an empty item schema', ({ assert }) => {
    assert.deepEqual(typeToSchema(fake({ isArray: () => true })), { type: 'array', items: {} })
  })

  test('maps a union of two distinct primitives to oneOf', ({ assert }) => {
    assert.deepEqual(typeToSchema(unionOf([string(), number()])), {
      oneOf: [{ type: 'string' }, { type: 'number' }],
    })
  })

  test('expresses a nullable primitive using the 3.1 type array', ({ assert }) => {
    assert.deepEqual(typeToSchema(unionOf([string(), nullType()])), {
      type: ['string', 'null'],
    })
  })

  test('deduplicates identical union members', ({ assert }) => {
    assert.deepEqual(typeToSchema(unionOf([string(), literalType()])), { type: 'string' })
  })

  test('maps a null-only union to a null type', ({ assert }) => {
    assert.deepEqual(typeToSchema(unionOf([nullType()])), { type: 'null' })
  })

  test('maps an undefined-only union to an empty schema', ({ assert }) => {
    assert.deepEqual(typeToSchema(unionOf([undefinedType()])), {})
  })

  test('maps an empty-schema union with null via anyOf', ({ assert }) => {
    assert.deepEqual(typeToSchema(unionOf([anyType(), nullType()])), {
      anyOf: [{}, { type: 'null' }],
    })
  })

  test('maps an object with required and optional properties', ({ assert }) => {
    const schema = typeToSchema(
      objectOf({
        id: { type: number() },
        name: { type: string() },
        note: { optional: true, type: string() },
      })
    )

    assert.deepEqual(schema, {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['id', 'name'],
    })
  })

  test('maps nested objects', ({ assert }) => {
    const schema = typeToSchema(
      objectOf({
        user: { type: objectOf({ id: { type: number() } }) },
      })
    )

    assert.deepEqual(schema, {
      type: 'object',
      properties: {
        user: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
      },
      required: ['user'],
    })
  })

  test('treats an undefined union member as optional', ({ assert }) => {
    const schema = typeToSchema(objectOf({ name: { type: unionOf([string(), undefinedType()]) } }))

    assert.deepEqual(schema.required, undefined)
  })

  test('skips never and undefined properties', ({ assert }) => {
    const schema = typeToSchema(
      objectOf({
        id: { type: number() },
        ghost: { type: neverType() },
        absent: { optional: true, type: undefinedType() },
      })
    )

    assert.deepEqual(Object.keys(schema.properties ?? {}), ['id'])
  })

  test('maps an intersection type as an object', ({ assert }) => {
    const schema = typeToSchema(intersectionOf([{ name: 'id', optional: false, type: number() }]))

    assert.deepEqual(schema, {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    })
  })
})

test.group('typeToParameters', () => {
  test('returns empty for non-object or empty types', ({ assert }) => {
    assert.deepEqual(typeToParameters(string(), 'query'), [])
    assert.deepEqual(typeToParameters(objectOf({}), 'query'), [])
  })

  test('maps object properties to query parameters with required flags', ({ assert }) => {
    const params = typeToParameters(
      objectOf({
        includeChecked: { optional: true, type: boolean() },
        limit: { type: number() },
      }),
      'query'
    )

    assert.deepEqual(params, [
      { name: 'includeChecked', in: 'query', required: false, schema: { type: 'boolean' } },
      { name: 'limit', in: 'query', required: true, schema: { type: 'number' } },
    ])
  })
})
