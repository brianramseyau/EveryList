/**
 * Error types controlling the CLI's process exit codes (see `run.ts`). Anything a command can
 * fail with is either a `CliError` (a clean, human-readable message) or an unexpected throw
 * (reported with its stack). Keeping the codes distinct lets scripts branch on the failure
 * kind instead of grepping stderr.
 */
export class CliError extends Error {
  /** 1 = runtime/API failure (the default), 2 = bad usage, 3 = auth/config problem. */
  readonly exitCode: number

  constructor(message: string, exitCode = 1) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

/** Bad arguments: an unknown command, a missing required argument, an unparseable flag value. */
export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2)
    this.name = 'UsageError'
  }
}

/**
 * No usable base URL/token, or the server rejected the token (401/403). Distinct from a generic
 * runtime error so `everylist token check` and scripts can tell "you need to log in" apart from
 * "the request failed".
 */
export class AuthError extends CliError {
  constructor(message: string) {
    super(message, 3)
    this.name = 'AuthError'
  }
}
