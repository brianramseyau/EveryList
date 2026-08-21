import { defineConfig } from '@adonisjs/transmit'

export default defineConfig({
  // A heartbeat keeps the SSE connection from sitting idle long enough for mobile
  // carrier NATs/proxies to silently drop it between list edits during co-shopping.
  pingInterval: '30s',
  transport: null,
})
