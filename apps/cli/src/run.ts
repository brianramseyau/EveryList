import { parseArgs, boolFlag, stringFlag } from './args.js'
import { ApiClient } from './client.js'
import {
  BASE_URL_ENV,
  TOKEN_ENV,
  normalizeBaseUrl,
  readConfig,
  resolveBaseUrl,
  resolveToken
} from './config.js'
import type { CommandContext } from './context.js'
import { CliError, UsageError } from './errors.js'
import { processOutput, type Output } from './output.js'
import { helpText, commands } from './help.js'
import { version } from './version.js'

export interface RunOptions {
  /** Injected for tests; defaults to the real process streams. */
  output?: Output
  /** Injected for tests; defaults to reading a line from stdin. */
  prompt?: (question: string) => Promise<string>
  /** Injected for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
}

/**
 * Runs the CLI end to end for one invocation: parse argv, resolve credentials, dispatch to the
 * matching command, and translate any thrown `CliError` into a message + exit code. Returns the
 * process exit code rather than calling `process.exit`, so it's fully testable (and so a caller
 * can flush output first).
 */
export async function run(
  argv: string[],
  { output = processOutput, prompt = defaultPrompt, env = process.env }: RunOptions = {}
): Promise<number> {
  const parsed = parseArgs(argv)
  const ctx: CommandContext = {
    command: parsed.command,
    positionals: parsed.positionals,
    flags: parsed.flags,
    output,
    prompt,
    env
  }

  // Help and version never need credentials or a valid config, so they run first — a malformed or
  // insecure saved URL must not stop `everylist help` from printing help.
  if (boolFlag(parsed.flags, 'version') || parsed.command === 'version') {
    output.out(`${version()}\n`)
    return 0
  }

  if (!parsed.command || boolFlag(parsed.flags, 'help') || parsed.command === 'help') {
    output.out(`${helpText(parsed.command === 'help' ? parsed.positionals[0] : undefined)}\n`)
    return 0
  }

  // Everything else — credential resolution and the command itself — runs inside the try below: a
  // valueless `--url`/`--token` (a `UsageError` from `stringFlag`), an insecure/malformed URL
  // (from the `ApiClient` constructor), or an unknown command must be reported like any other CLI
  // error, not escape as an unhandled rejection.
  try {
    const config = readConfig(env)
    const urlFlag = stringFlag(parsed.flags, 'url')
    const baseUrl = urlFlag !== undefined ? normalizeBaseUrl(urlFlag) : resolveBaseUrl(config, env)
    const token = stringFlag(parsed.flags, 'token') ?? resolveToken(config, env)
    if (baseUrl && token) ctx.client = new ApiClient(baseUrl, token, fetch, 30_000, env)
    ctx.baseUrl = baseUrl
    ctx.token = token

    const command = commands[parsed.command]
    if (!command) {
      throw new UsageError(`Unknown command "${parsed.command}". Run \`everylist help\`.`)
    }

    await command.handler(ctx)
    return 0
  } catch (error) {
    if (error instanceof CliError) {
      output.err(`${error.message}\n`)
      return error.exitCode
    }
    output.err(`Unexpected error: ${describeUnexpectedError(error)}\n`)
    return 1
  }
}

/** Formats an unexpected (non-`CliError`) throw: an Error's stack when it has one, otherwise its
 *  string form. Kept as its own function so both arms are directly testable. */
export function describeUnexpectedError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}

/** A readable stream for {@link defaultPrompt} — the real stdin by default, a `PassThrough` in
 *  tests. The optional TTY hooks let the prompt hide typed input when attached to a terminal. */
export interface PromptStdin {
  on(event: 'data', listener: (chunk: string) => void): void
  off(event: 'data', listener: (chunk: string) => void): void
  on(event: 'end', listener: () => void): void
  off(event: 'end', listener: () => void): void
  setEncoding(encoding: BufferEncoding): unknown
  pause(): void
  resume(): void
  isTTY?: boolean
  setRawMode?(mode: boolean): void
}

/** A writable pair for {@link defaultPrompt} — real process.stderr by default. */
export interface PromptStreams {
  stdin: PromptStdin
  stderr: { write(text: string): unknown }
}

/**
 * Reads one line from stdin for interactive prompts (e.g. `login` with no `--token`). The prompt
 * itself goes to stderr so a command's stdout stays clean for piping. On a TTY the terminal's
 * echo is turned off for the duration, so a pasted token never appears on screen; a piped stdin
 * (not a TTY) is read as-is, which is what scripts and tests use.
 *
 * `Ctrl+C` in raw mode arrives as a `\x03` byte (not a signal), so it's handled explicitly — as
 * is stdin ending before a newline — both of which abort the prompt by throwing a `CliError`
 * rather than leaving the promise unsettled (and terminal echo off).
 */
export function defaultPrompt(
  question: string,
  streams: PromptStreams = { stdin: process.stdin, stderr: process.stderr }
): Promise<string> {
  return new Promise((resolve, reject) => {
    streams.stderr.write(question)
    const hide = streams.stdin.isTTY === true && typeof streams.stdin.setRawMode === 'function'
    if (hide) streams.stdin.setRawMode!(true)

    let data = ''
    streams.stdin.setEncoding('utf8')

    const cleanup = (echoNewline: boolean) => {
      streams.stdin.off('data', onData)
      streams.stdin.off('end', onEnd)
      if (hide) streams.stdin.setRawMode!(false)
      streams.stdin.pause()
      if (echoNewline) streams.stderr.write('\n')
    }

    const onData = (chunk: string) => {
      if (chunk.includes('\x03')) {
        cleanup(true)
        reject(new CliError('Aborted.'))
        return
      }
      data += chunk
      // Raw-mode terminals emit `\r` on Enter, line-mode ones `\n` — accept either.
      const end = data.search(/[\r\n]/)
      if (end !== -1) {
        cleanup(hide)
        resolve(data.slice(0, end))
      }
    }

    const onEnd = () => {
      cleanup(false)
      reject(new CliError('No input provided.'))
    }

    streams.stdin.on('data', onData)
    streams.stdin.on('end', onEnd)
    streams.stdin.resume()
  })
}

/** Env var names re-exported for help text and tests. */
export { BASE_URL_ENV, TOKEN_ENV }
