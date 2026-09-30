import { describe, expect, it } from 'vitest'
import { parseArgs, rejectUnknownFlags, stringFlag, boolFlag } from '../src/args.js'
import { UsageError } from '../src/errors.js'

describe('parseArgs', () => {
  it('treats the first bare token as the command and the rest as positionals', () => {
    const parsed = parseArgs(['add', 'Groceries', 'Milk'])
    expect(parsed.command).toBe('add')
    expect(parsed.positionals).toEqual(['Groceries', 'Milk'])
    expect(parsed.flags).toEqual({})
  })

  it('returns no command when only flags are given', () => {
    const parsed = parseArgs(['--json'])
    expect(parsed.command).toBeUndefined()
    expect(parsed.flags).toEqual({ json: true })
  })

  it('parses --name value pairs', () => {
    const parsed = parseArgs(['add', 'Groceries', 'Milk', '--quantity', '2'])
    expect(parsed.flags).toEqual({ quantity: '2' })
  })

  it('parses --name=value', () => {
    const parsed = parseArgs(['add', 'Groceries', 'Milk', '--notes=two%20litres'])
    expect(parsed.flags).toEqual({ notes: 'two%20litres' })
  })

  it('treats a valueless long flag as true', () => {
    const parsed = parseArgs(['items', 'Groceries', '--all', '--json'])
    expect(parsed.flags).toEqual({ all: true, json: true })
  })

  it('parses a valueless long flag at the end of argv as true', () => {
    const parsed = parseArgs(['items', 'Groceries', '--all', '--json'])
    expect(parsed.flags.all).toBe(true)
  })

  it('does not consume a following flag as a value', () => {
    const parsed = parseArgs(['--json', '--all'])
    expect(parsed.flags).toEqual({ json: true, all: true })
  })

  it('resolves short aliases to their canonical flag names', () => {
    const parsed = parseArgs(['add', 'L', 'M', '-q', '3'])
    expect(parsed.flags).toEqual({ quantity: '3' })
  })

  it('keeps unknown short flags under their bare letter', () => {
    const parsed = parseArgs(['-z'])
    expect(parsed.flags).toEqual({ z: true })
  })

  it('does not consume a following token for boolean short aliases', () => {
    const parsed = parseArgs(['-h', 'lists'])
    expect(parsed.flags).toEqual({ help: true })
    expect(parsed.command).toBe('lists')
  })

  it('treats a lone dash as a positional', () => {
    const parsed = parseArgs(['search', '-'])
    expect(parsed.positionals).toEqual(['-'])
  })

  it('forces every token after -- to be positional', () => {
    const parsed = parseArgs(['add', 'Groceries', '--', '--weird-name'])
    expect(parsed.command).toBe('add')
    expect(parsed.positionals).toEqual(['Groceries', '--weird-name'])
    expect(parsed.flags).toEqual({})
  })

  it('keeps the first positional as the command even when flags precede it', () => {
    const parsed = parseArgs(['--json', 'lists'])
    expect(parsed.command).toBe('lists')
    expect(parsed.positionals).toEqual([])
  })
})

describe('rejectUnknownFlags', () => {
  it('accepts known global and command flags', () => {
    expect(() => rejectUnknownFlags({ json: true, list: 'x' }, ['list'])).not.toThrow()
  })

  it('rejects an unknown flag with a singular message', () => {
    expect(() => rejectUnknownFlags({ quanity: '2' }, ['quantity'])).toThrow(UsageError)
    expect(() => rejectUnknownFlags({ quanity: '2' }, ['quantity'])).toThrow(
      'Unknown option: --quanity'
    )
  })

  it('pluralizes the message for several unknown flags', () => {
    expect(() => rejectUnknownFlags({ a: true, b: true })).toThrow('Unknown options: --a, --b')
  })
})

describe('stringFlag and boolFlag', () => {
  it('returns the string value', () => {
    expect(stringFlag({ quantity: '2' }, 'quantity')).toBe('2')
  })

  it('returns undefined for an absent flag', () => {
    expect(stringFlag({}, 'missing')).toBeUndefined()
  })

  it('throws a UsageError when a value flag was passed without a value', () => {
    expect(() => stringFlag({ quantity: true }, 'quantity')).toThrow(UsageError)
    expect(() => stringFlag({ quantity: true }, 'quantity')).toThrow(
      'Option --quantity requires a value.'
    )
  })

  it('reports true only for a valueless boolean flag', () => {
    expect(boolFlag({ json: true }, 'json')).toBe(true)
    expect(boolFlag({ notes: 'x' }, 'notes')).toBe(false)
    expect(boolFlag({}, 'json')).toBe(false)
  })
})
