#!/usr/bin/env node
/**
 * Pre-flight check for `pnpm dev`.
 *
 * EveryList's dev servers bind fixed ports — the API on 3334 (PORT in
 * apps/api/.env, see apps/api/.env.example) and the web app on 5174
 * (server.port in apps/web/vite.config.ts). If another process is already
 * listening on one of them, the API silently ends up on a random port, Vite
 * silently moves to the next free port, and the web app's `/api` proxy points
 * at the wrong server — every request then fails with an E_ROUTE_NOT_FOUND
 * "Cannot POST:/api/..." error.
 *
 * This script aborts `pnpm dev` before that can happen and prints the
 * conflicting processes (pid, command, working directory) so you can kill them.
 */

import { spawnSync } from 'node:child_process'
import net from 'node:net'

const API_PORT = 3334
const WEB_PORT = 5174

function isPortInUse(port) {
  return new Promise((resolve) => {
    let tried = 0
    const hosts = ['127.0.0.1', '::1']
    const checkHost = (host) => {
      const socket = net.connect({ port, host })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        tried += 1
        if (tried === hosts.length) resolve(false)
      })
    }
    hosts.forEach(checkHost)
  })
}

function listenersOn(port) {
  // `lsof -iTCP:PORT -sTCP:LISTEN` columns: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
  const stdout = spawnSync('lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN'], {
    encoding: 'utf8'
  }).stdout

  return stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length >= 2 && /^\d+$/.test(cols[1]))
    .map((cols) => {
      const pid = cols[1]
      const command =
        spawnSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' }).stdout.trim() ||
        cols[0]
      const cwdLine = spawnSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], {
        encoding: 'utf8'
      })
        .stdout.split('\n')
        .map((line) => line.trim())
        .find((line) => line.startsWith('n'))
      return { pid, command, cwd: cwdLine ? cwdLine.slice(1) : '(unknown cwd)' }
    })
}

const conflicts = []
for (const port of [API_PORT, WEB_PORT]) {
  if (await isPortInUse(port)) {
    conflicts.push({ port, listeners: listenersOn(port) })
  }
}

if (conflicts.length === 0) {
  console.log(`Ports ${API_PORT} (API) and ${WEB_PORT} (web) are free - starting dev servers.`)
  process.exit(0)
}

console.error('')
console.error(
  `EveryList dev needs ports ${API_PORT} (API) and ${WEB_PORT} (web), but something else is already listening:`
)
console.error('')
for (const { port, listeners } of conflicts) {
  for (const listener of listeners) {
    console.error(
      `  port ${port}  pid ${listener.pid}  ${listener.command}  (cwd: ${listener.cwd})`
    )
  }
}
console.error('')
console.error('Stop the conflicting processes (e.g. `kill <pid>`) and run `pnpm dev` again.')
console.error('')
process.exit(1)
