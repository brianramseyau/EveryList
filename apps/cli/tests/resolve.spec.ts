import { describe, expect, it } from 'vitest'
import {
  fetchAccessToken,
  fetchLists,
  grantedLists,
  requirePositional,
  resolveItem,
  resolveList
} from '../src/resolve.js'
import { CliError, UsageError } from '../src/errors.js'
import type { ApiClient } from '../src/client.js'
import type { AccessTokenDto, ItemDto, ListDto } from '@everylist/shared'

function list(overrides: Partial<ListDto>): ListDto {
  return {
    id: 1,
    name: 'Groceries',
    color: '#fff',
    icon: null,
    ownerId: 1,
    folderId: null,
    archived: false,
    badgeExcluded: false,
    passcodeHash: null,
    itemCount: 0,
    createdAt: '2026-01-01',
    updatedAt: null,
    version: 1,
    ...overrides
  }
}

function item(overrides: Partial<ItemDto>): ItemDto {
  return {
    id: 1,
    listId: 1,
    name: 'Milk',
    quantity: null,
    notes: null,
    categoryId: null,
    storeId: null,
    price: null,
    deadline: null,
    checked: false,
    checkedAt: null,
    sortOrder: 1,
    createdBy: 1,
    createdAt: '2026-01-01',
    updatedAt: null,
    deletedAt: null,
    version: 1,
    ...overrides
  }
}

describe('fetchAccessToken / fetchLists', () => {
  it('requests the PAT introspection endpoint', async () => {
    const get = async (path: string) => ({ path })
    const client = { get } as unknown as ApiClient
    expect(await fetchAccessToken(client)).toEqual({ path: '/api/v1/tokens/me' })
  })

  it('requests the lists endpoint', async () => {
    const get = async (path: string) => ({ path })
    const client = { get } as unknown as ApiClient
    expect(await fetchLists(client)).toEqual({ path: '/api/v1/lists' })
  })
})

describe('grantedLists', () => {
  const token: AccessTokenDto = {
    id: 1,
    name: 'test',
    grants: [{ listId: 2, role: 'editor' }],
    lastUsedAt: null,
    expiresAt: null,
    createdAt: '2026-01-01'
  }

  it('keeps only the lists the token was granted', () => {
    const lists = [list({ id: 1 }), list({ id: 2 })]
    expect(grantedLists(lists, token).map((l) => l.id)).toEqual([2])
  })

  it("overwrites each list's role with the token's grant, not the membership role", () => {
    const lists = [list({ id: 2, role: 'owner' })]
    expect(grantedLists(lists, token)[0]!.role).toBe('editor')
  })

  it('returns an empty array when nothing is granted', () => {
    expect(grantedLists([list({ id: 1 })], { ...token, grants: [] })).toEqual([])
  })
})

describe('resolveList', () => {
  const lists = [list({ id: 1, name: 'Groceries' }), list({ id: 2, name: 'Camping Trip' })]

  it('resolves by numeric id', () => {
    expect(resolveList(lists, '2').id).toBe(2)
  })

  it('resolves by exact case-insensitive name', () => {
    expect(resolveList(lists, 'groceries').id).toBe(1)
    expect(resolveList(lists, '  Camping Trip  ').id).toBe(2)
  })

  it('throws when the id is not granted', () => {
    expect(() => resolveList(lists, '99')).toThrow('No list with id 99')
  })

  it('throws when the name is not granted', () => {
    expect(() => resolveList(lists, 'Nope')).toThrow('No list named "Nope"')
  })

  it('refuses an ambiguous name and lists the ids', () => {
    const dupes = [list({ id: 3, name: 'Same' }), list({ id: 4, name: 'Same' })]
    expect(() => resolveList(dupes, 'same')).toThrow(CliError)
    expect(() => resolveList(dupes, 'same')).toThrow(
      'More than one list is named "same" (ids 3, 4)'
    )
  })
})

describe('resolveItem', () => {
  const items = [
    item({ id: 1, name: 'Milk', checked: true }),
    item({ id: 2, name: 'Milk', checked: false }),
    item({ id: 3, name: 'Bread' })
  ]

  it('resolves by numeric id', () => {
    expect(resolveItem(items, '3').id).toBe(3)
  })

  it('prefers the open row when a checked row shares the name', () => {
    expect(resolveItem(items, 'milk').id).toBe(2)
  })

  it('falls back to a checked row when no open row matches', () => {
    const onlyChecked = [item({ id: 1, name: 'Eggs', checked: true })]
    expect(resolveItem(onlyChecked, 'eggs').id).toBe(1)
  })

  it('throws when the id is absent', () => {
    expect(() => resolveItem(items, '99')).toThrow('No item with id 99')
  })

  it('throws when the name is absent', () => {
    expect(() => resolveItem(items, 'Nope')).toThrow('No item named "Nope"')
  })

  it('refuses two open rows with the same name', () => {
    const dupes = [item({ id: 5, name: 'Same' }), item({ id: 6, name: 'Same' })]
    expect(() => resolveItem(dupes, 'same')).toThrow(
      'More than one item is named "same" (ids 5, 6)'
    )
  })
})

describe('requirePositional', () => {
  it('returns the value at the index', () => {
    expect(requirePositional(['a', 'b'], 1, '<b>')).toBe('b')
  })

  it('throws a UsageError when missing', () => {
    expect(() => requirePositional(['a'], 1, '<list>')).toThrow(UsageError)
    expect(() => requirePositional(['a'], 1, '<list>')).toThrow('Missing required argument: <list>')
  })

  it('treats an empty string as missing', () => {
    expect(() => requirePositional([''], 0, '<list>')).toThrow(UsageError)
  })
})
