import { describe, expect, it, vi } from 'vitest'
import { formatJson, formatTable, processOutput } from '../src/output.js'

describe('formatJson', () => {
  it('pretty-prints with two-space indentation', () => {
    expect(formatJson({ a: 1 })).toBe('{\n  "a": 1\n}')
  })
})

describe('formatTable', () => {
  it('pads columns to the widest cell', () => {
    const table = formatTable(
      [
        ['1', 'Milk'],
        ['22', 'Bread']
      ],
      ['ID', 'NAME']
    )
    expect(table.split('\n')).toEqual(['ID  NAME', '1   Milk', '22  Bread'])
  })

  it('works without headers', () => {
    expect(formatTable([['a'], ['bb']])).toBe('a\nbb')
  })

  it('counts wide characters (CJK/emoji) as two columns', () => {
    const table = formatTable([
      ['ab', 'x'],
      ['日本', 'y']
    ])
    // "日本" is 4 display columns, "ab" is 2, so the second column starts one past the first's width.
    expect(table.split('\n')[1]).toBe('日本  y')
  })

  it('trims trailing whitespace on each row', () => {
    const table = formatTable([
      ['a', ''],
      ['bb', '']
    ])
    expect(table.split('\n')).toEqual(['a', 'bb'])
  })
})

describe('processOutput', () => {
  it('writes out and err to the real process streams', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      processOutput.out('hello')
      processOutput.err('oops')
      expect(out).toHaveBeenCalledWith('hello')
      expect(err).toHaveBeenCalledWith('oops')
    } finally {
      out.mockRestore()
      err.mockRestore()
    }
  })
})
