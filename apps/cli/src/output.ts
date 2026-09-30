/**
 * Output helpers shared by every command. `--json` prints machine-readable output (the raw API
 * object, or an array result) and suppresses the human formatting; the default is a compact
 * table or one-line summary that reads well in a terminal.
 */

/** The `--json` mode: `JSON.stringify` with two-space indentation. Passed through once, at the
 *  command boundary, so every command's JSON is identically shaped. */
export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/** Pads every cell of a column to that column's widest value, for a plain fixed-width table. */
export function formatTable(rows: string[][], headers?: string[]): string {
  const all = headers ? [headers, ...rows] : rows
  const widths: number[] = []
  for (const row of all) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, displayWidth(cell))
    })
  }
  return all
    .map((row) =>
      row
        .map((cell, index) => cell + ' '.repeat(widths[index]! - displayWidth(cell)))
        .join('  ')
        .trimEnd()
    )
    .join('\n')
}

/**
 * A rough visible width: characters in the CJK, Hangul, and emoji blocks count as two terminal
 * columns, everything else as one. A single threshold rather than a full Unicode width table —
 * enough to keep columns aligned for the names this app actually holds (a Latin name with an
 * emoji, a CJK grocery list) without pulling in the table.
 */
function displayWidth(cell: string): number {
  let width = 0
  for (const char of cell) {
    width += isWide(char) ? 2 : 1
  }
  return width
}

/** True for a character in the CJK/Hangul/emoji blocks — a `for…of` always yields a complete
 *  character, so `codePointAt(0)` is always defined. */
function isWide(char: string): boolean {
  return char.codePointAt(0)! > 0x2e7f
}

/**
 * The CLI's standard output sink, injectable so tests can assert on exactly what a command
 * printed without touching the real process streams.
 */
export interface Output {
  /** Write a chunk to stdout (no implicit newline). */
  out(text: string): void
  /** Write a chunk to stderr (no implicit newline). */
  err(text: string): void
}

/** The real process-backed output. */
export const processOutput: Output = {
  out: (text) => {
    process.stdout.write(text)
  },
  err: (text) => {
    process.stderr.write(text)
  }
}
