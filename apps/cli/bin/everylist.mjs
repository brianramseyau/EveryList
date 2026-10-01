#!/usr/bin/env node
import { run } from '../dist/index.js'

// `run` returns an exit code rather than calling `process.exit` itself (so it stays unit-testable
// and so output can flush first); the bin is the one place that turns it into an actual exit.
process.exitCode = await run(process.argv.slice(2))
