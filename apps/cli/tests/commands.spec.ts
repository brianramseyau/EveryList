import { describe, expect, it } from 'vitest'
import { listsCommand } from '../src/commands/lists.js'
import { addCommand, checkoffCommand } from '../src/commands/add.js'
import { itemsCommand, listCommand } from '../src/commands/items.js'
import { removeCommand } from '../src/commands/remove.js'
import { searchCommand } from '../src/commands/search.js'
import { UsageError } from '../src/errors.js'
import {
  context,
  fakeClient,
  itemFixture,
  listFixture,
  recordingOutput,
  tokenFixture
} from './helpers.js'

/** A fake client that answers the standard list/token/item reads these commands make. */
function standardClient(overrides: Parameters<typeof fakeClient>[0] = {}) {
  return fakeClient({
    get: (path) => {
      if (path === '/api/v1/tokens/me') return tokenFixture()
      if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries', itemCount: 2 })]
      if (path === '/api/v1/lists/1/items') return [itemFixture({ id: 10, name: 'Milk' })]
      if (path === '/api/v1/lists/1/categories') return [{ id: 5, name: 'Dairy' }]
      return undefined
    },
    ...overrides
  })
}

describe('listsCommand', () => {
  it('prints a table of granted lists', async () => {
    const output = recordingOutput()
    await listsCommand(context({ client: standardClient(), output }))
    expect(output.stdout).toContain('Groceries')
    expect(output.stdout).toContain('ID  NAME')
  })

  it('prints JSON when --json is set', async () => {
    const output = recordingOutput()
    await listsCommand(context({ client: standardClient(), output, flags: { json: true } }))
    expect(JSON.parse(output.stdout)).toHaveLength(1)
  })

  it('reports when the token has no granted lists', async () => {
    const output = recordingOutput()
    const client = fakeClient({
      get: (path) =>
        path === '/api/v1/tokens/me'
          ? tokenFixture({ grants: [] })
          : path === '/api/v1/lists'
            ? [listFixture()]
            : undefined
    })
    await listsCommand(context({ client, output }))
    expect(output.stdout).toContain('no granted lists')
  })

  it('shows the token’s granted role, not the account membership role', async () => {
    const output = recordingOutput()
    const client = fakeClient({
      get: (path) =>
        path === '/api/v1/tokens/me'
          ? tokenFixture({ grants: [{ listId: 1, role: 'viewer' }] })
          : path === '/api/v1/lists'
            ? [listFixture({ role: 'owner' })]
            : undefined
    })
    await listsCommand(context({ client, output }))
    expect(output.stdout).toContain('viewer')
    expect(output.stdout).not.toContain('owner')
  })
})

describe('listCommand', () => {
  it('prints the list details', async () => {
    const output = recordingOutput()
    await listCommand(context({ client: standardClient(), output, positionals: ['Groceries'] }))
    expect(output.stdout).toContain('Groceries (id 1)')
    expect(output.stdout).toContain('Role: editor')
    expect(output.stdout).toContain('Open items: 2')
  })

  it('prints JSON when --json is set', async () => {
    const output = recordingOutput()
    await listCommand(
      context({ client: standardClient(), output, positionals: ['1'], flags: { json: true } })
    )
    expect(JSON.parse(output.stdout).id).toBe(1)
  })

  it('includes the owner name when present', async () => {
    const output = recordingOutput()
    const client = fakeClient({
      get: (path) =>
        path === '/api/v1/tokens/me'
          ? tokenFixture()
          : path === '/api/v1/lists'
            ? [listFixture({ ownerName: 'Sam' })]
            : undefined
    })
    await listCommand(context({ client, output, positionals: ['1'] }))
    expect(output.stdout).toContain('Owner: Sam')
  })

  it('shows the token’s granted role, not the account membership role', async () => {
    const output = recordingOutput()
    const client = fakeClient({
      get: (path) =>
        path === '/api/v1/tokens/me'
          ? tokenFixture({ grants: [{ listId: 1, role: 'viewer' }] })
          : path === '/api/v1/lists'
            ? [listFixture({ role: 'owner' })]
            : undefined
    })
    await listCommand(context({ client, output, positionals: ['1'] }))
    expect(output.stdout).toContain('Role: viewer')
  })

  it('requires a list argument', async () => {
    const output = recordingOutput()
    await expect(
      listCommand(context({ client: standardClient(), output, positionals: [] }))
    ).rejects.toBeInstanceOf(UsageError)
  })
})

describe('itemsCommand', () => {
  it('prints only open items by default', async () => {
    const output = recordingOutput()
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items')
          return [
            itemFixture({ id: 10, name: 'Milk', categoryId: 5 }),
            itemFixture({ id: 11, name: 'Bread', checked: true })
          ]
        if (path === '/api/v1/lists/1/categories') return [{ id: 5, name: 'Dairy' }]
        return undefined
      }
    })
    await itemsCommand(context({ client, output, positionals: ['1'] }))
    expect(output.stdout).toContain('Milk')
    expect(output.stdout).not.toContain('Bread')
    expect(output.stdout).toContain('Dairy')
  })

  it('includes checked items with --all', async () => {
    const output = recordingOutput()
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items')
          return [itemFixture({ id: 11, name: 'Bread', checked: true })]
        if (path === '/api/v1/lists/1/categories') return []
        return undefined
      }
    })
    await itemsCommand(context({ client, output, positionals: ['1'], flags: { all: true } }))
    expect(output.stdout).toContain('Bread')
  })

  it('reports when there are no items to show', async () => {
    const output = recordingOutput()
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items') return [itemFixture({ checked: true })]
        return undefined
      }
    })
    await itemsCommand(context({ client, output, positionals: ['1'] }))
    expect(output.stdout).toContain('No open items on Groceries')
  })

  it('reports an empty list with --all using the unqualified wording', async () => {
    const output = recordingOutput()
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items') return []
        return undefined
      }
    })
    await itemsCommand(context({ client, output, positionals: ['1'], flags: { all: true } }))
    expect(output.stdout).toContain('No items on Groceries')
  })

  it('prints JSON when --json is set', async () => {
    const output = recordingOutput()
    await itemsCommand(
      context({ client: standardClient(), output, positionals: ['1'], flags: { json: true } })
    )
    expect(JSON.parse(output.stdout)).toHaveLength(1)
  })

  it('falls back to blank category when the item has an unknown category id', async () => {
    const output = recordingOutput()
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items') return [itemFixture({ categoryId: 999 })]
        if (path === '/api/v1/lists/1/categories') return []
        return undefined
      }
    })
    await itemsCommand(context({ client, output, positionals: ['1'] }))
    expect(output.stdout).toContain('Milk')
  })
})

describe('addCommand', () => {
  it('posts the name and optional fields', async () => {
    const output = recordingOutput()
    const calls: Array<{ method: string; path: string; body?: unknown }> = []
    const client = standardClient({
      post: () => ({ id: 42, name: 'Milk' }),
      calls
    })
    await addCommand(
      context({
        client,
        output,
        positionals: ['Groceries', 'Milk'],
        flags: { quantity: '2', notes: 'semi', price: '3.50', deadline: '2026-10-01' }
      })
    )
    expect(output.stdout).toContain('Added "Milk" to Groceries (item id 42)')
    const post = calls.find((c) => c.method === 'POST')
    expect(post?.body).toEqual({
      name: 'Milk',
      quantity: '2',
      notes: 'semi',
      deadline: '2026-10-01',
      price: 350
    })
  })

  it('omits optional fields that were not passed', async () => {
    const output = recordingOutput()
    const calls: Array<{ method: string; path: string; body?: unknown }> = []
    const client = standardClient({ post: () => ({ id: 1, name: 'Milk' }), calls })
    await addCommand(context({ client, output, positionals: ['1', 'Milk'] }))
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'Milk' })
  })

  it('prints JSON when --json is set', async () => {
    const output = recordingOutput()
    const client = standardClient({ post: () => ({ id: 1, name: 'Milk' }) })
    await addCommand(context({ client, output, positionals: ['1', 'Milk'], flags: { json: true } }))
    expect(JSON.parse(output.stdout).id).toBe(1)
  })

  it('requires both list and item arguments', async () => {
    const output = recordingOutput()
    const client = standardClient()
    await expect(
      addCommand(context({ client, output, positionals: ['Groceries'] }))
    ).rejects.toBeInstanceOf(UsageError)
  })
})

describe('checkoffCommand', () => {
  it('checks off an item by name', async () => {
    const output = recordingOutput()
    const calls: Array<{ method: string; path: string; body?: unknown }> = []
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items') return [itemFixture({ id: 10, name: 'Milk' })]
        return undefined
      },
      patch: () => ({ id: 10, checked: true }),
      calls
    })
    await checkoffCommand(context({ client, output, positionals: ['1', 'Milk'] }), true)
    expect(output.stdout).toContain('Checked off "Milk" on Groceries')
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ checked: true })
  })

  it('re-opens an item with uncheck', async () => {
    const output = recordingOutput()
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items') return [itemFixture({ id: 10, name: 'Milk' })]
        return undefined
      },
      patch: () => ({ id: 10, checked: false })
    })
    await checkoffCommand(context({ client, output, positionals: ['1', 'Milk'] }), false)
    expect(output.stdout).toContain('Reopened "Milk"')
  })

  it('prints JSON when --json is set', async () => {
    const output = recordingOutput()
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items') return [itemFixture({ id: 10, name: 'Milk' })]
        return undefined
      },
      patch: () => ({ id: 10, checked: true })
    })
    await checkoffCommand(
      context({ client, output, positionals: ['1', 'Milk'], flags: { json: true } }),
      true
    )
    expect(JSON.parse(output.stdout).checked).toBe(true)
  })
})

describe('removeCommand', () => {
  it('deletes an item by name', async () => {
    const output = recordingOutput()
    const calls: Array<{ method: string; path: string; body?: unknown }> = []
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items') return [itemFixture({ id: 10, name: 'Milk' })]
        return undefined
      },
      delete: () => undefined,
      calls
    })
    await removeCommand(context({ client, output, positionals: ['1', 'Milk'] }))
    expect(output.stdout).toContain('Removed "Milk" from Groceries')
    expect(calls.find((c) => c.method === 'DELETE')?.path).toBe('/api/v1/lists/1/items/10')
  })

  it('prints JSON when --json is set', async () => {
    const output = recordingOutput()
    const client = standardClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items') return [itemFixture({ id: 10, name: 'Milk' })]
        return undefined
      },
      delete: () => undefined
    })
    await removeCommand(
      context({ client, output, positionals: ['1', 'Milk'], flags: { json: true } })
    )
    expect(JSON.parse(output.stdout)).toEqual({ removed: 10, name: 'Milk' })
  })
})

describe('searchCommand', () => {
  function searchClient() {
    return fakeClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me')
          return tokenFixture({
            grants: [
              { listId: 1, role: 'editor' },
              { listId: 2, role: 'editor' }
            ]
          })
        if (path === '/api/v1/lists')
          return [
            listFixture({ id: 1, name: 'Groceries' }),
            listFixture({ id: 2, name: 'Camping' })
          ]
        if (path === '/api/v1/lists/1/items')
          return [
            itemFixture({ id: 10, name: 'Ground coffee beans' }),
            itemFixture({ id: 11, name: 'Milk' })
          ]
        if (path === '/api/v1/lists/2/items') return [itemFixture({ id: 20, name: 'Coffee' })]
        return undefined
      }
    })
  }

  it('returns substring matches across all granted lists', async () => {
    const output = recordingOutput()
    await searchCommand(context({ client: searchClient(), output, positionals: ['coffee'] }))
    expect(output.stdout).toContain('Ground coffee beans')
    expect(output.stdout).toContain('Coffee')
    expect(output.stdout).not.toContain('Milk')
  })

  it('narrows to one list with --list', async () => {
    const output = recordingOutput()
    await searchCommand(
      context({ client: searchClient(), output, positionals: ['coffee'], flags: { list: '2' } })
    )
    expect(output.stdout).toContain('Coffee')
    expect(output.stdout).not.toContain('Ground coffee beans')
  })

  it('reports when nothing matches', async () => {
    const output = recordingOutput()
    await searchCommand(context({ client: searchClient(), output, positionals: ['zzz'] }))
    expect(output.stdout).toContain('No items matching "zzz"')
  })

  it('prints JSON when --json is set', async () => {
    const output = recordingOutput()
    await searchCommand(
      context({ client: searchClient(), output, positionals: ['coffee'], flags: { json: true } })
    )
    const parsed = JSON.parse(output.stdout) as Array<{ list: string; name: string }>
    expect(parsed.map((r) => r.name)).toEqual(['Ground coffee beans', 'Coffee'])
  })

  it('marks a checked match as "checked"', async () => {
    const output = recordingOutput()
    const client = fakeClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items')
          return [itemFixture({ id: 10, name: 'Coffee', checked: true })]
        return undefined
      }
    })
    await searchCommand(context({ client, output, positionals: ['coffee'] }))
    expect(output.stdout).toContain('checked')
  })

  it('requires a query argument', async () => {
    const output = recordingOutput()
    await expect(
      searchCommand(context({ client: searchClient(), output, positionals: [] }))
    ).rejects.toBeInstanceOf(UsageError)
  })
})
