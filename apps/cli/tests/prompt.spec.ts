import { describe, expect, it } from 'vitest'
import { PassThrough } from 'node:stream'
import { defaultPrompt } from '../src/run.js'
import { commands } from '../src/help.js'
import {
  context,
  fakeClient,
  itemFixture,
  listFixture,
  recordingOutput,
  tokenFixture
} from './helpers.js'

describe('defaultPrompt', () => {
  it('resolves the first line typed on stdin and echoes the question to stderr', async () => {
    const stdin = new PassThrough()
    let question = ''
    const stderr = {
      write: (text: string) => {
        question = text
        return true
      }
    }

    const pending = defaultPrompt('Token: ', {
      stdin: stdin as unknown as Parameters<typeof defaultPrompt>[1]['stdin'],
      stderr
    })
    stdin.write('elt_secret\n')
    expect(await pending).toBe('elt_secret')
    expect(question).toBe('Token: ')
  })

  it('accumulates chunks until a newline arrives', async () => {
    const stdin = new PassThrough()
    const pending = defaultPrompt('', {
      stdin: stdin as unknown as Parameters<typeof defaultPrompt>[1]['stdin'],
      stderr: { write: () => true }
    })
    stdin.write('elt_')
    stdin.write('secret')
    stdin.write('\n')
    expect(await pending).toBe('elt_secret')
  })

  it('hides typed input when stdin is a TTY, restoring echo afterwards', async () => {
    const stdin = new PassThrough() as PassThrough & {
      isTTY?: boolean
      setRawMode?(mode: boolean): void
    }
    stdin.isTTY = true
    const rawModes: boolean[] = []
    stdin.setRawMode = (mode: boolean) => {
      rawModes.push(mode)
    }
    let written = ''
    const pending = defaultPrompt('Token: ', {
      stdin: stdin as unknown as Parameters<typeof defaultPrompt>[1]['stdin'],
      stderr: {
        write: (text: string) => {
          written += text
          return true
        }
      }
    })
    stdin.write('elt_secret\r')
    expect(await pending).toBe('elt_secret')
    expect(rawModes).toEqual([true, false])
    // A newline is echoed after the hidden value so the next output starts on its own line.
    expect(written).toBe('Token: \n')
  })

  it('aborts on Ctrl+C in raw mode, restoring echo', async () => {
    const stdin = new PassThrough() as PassThrough & {
      isTTY?: boolean
      setRawMode?(mode: boolean): void
    }
    stdin.isTTY = true
    const rawModes: boolean[] = []
    stdin.setRawMode = (mode: boolean) => {
      rawModes.push(mode)
    }
    const pending = defaultPrompt('Token: ', {
      stdin: stdin as unknown as Parameters<typeof defaultPrompt>[1]['stdin'],
      stderr: { write: () => true }
    })
    stdin.write('\x03')
    await expect(pending).rejects.toThrow('Aborted')
    expect(rawModes).toEqual([true, false])
  })

  it('rejects when stdin ends before a newline', async () => {
    const stdin = new PassThrough()
    const pending = defaultPrompt('Token: ', {
      stdin: stdin as unknown as Parameters<typeof defaultPrompt>[1]['stdin'],
      stderr: { write: () => true }
    })
    stdin.end()
    await expect(pending).rejects.toThrow('No input provided')
  })
})

describe('command registry', () => {
  it('wires the complete/uncheck wrappers to the shared checkoff handler', async () => {
    const output = recordingOutput()
    const client = fakeClient({
      get: (path) => {
        if (path === '/api/v1/tokens/me') return tokenFixture()
        if (path === '/api/v1/lists') return [listFixture({ id: 1, name: 'Groceries' })]
        if (path === '/api/v1/lists/1/items') return [itemFixture({ id: 10, name: 'Milk' })]
        return undefined
      },
      patch: () => ({ id: 10, checked: true })
    })
    await commands.complete!.handler(
      context({ client, output, positionals: ['1', 'Milk'], flags: {} })
    )
    expect(output.stdout).toContain('Checked off')

    const output2 = recordingOutput()
    await commands.uncheck!.handler(
      context({ client, output: output2, positionals: ['1', 'Milk'], flags: {} })
    )
    expect(output2.stdout).toContain('Reopened')
  })
})
