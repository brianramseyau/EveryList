import { defineConfig } from '@playwright/test';

// The offline-sync E2E scenario needs a real API to round-trip through — the plain
// `build && preview` static server has nowhere to proxy `/api/v1/*` requests to. So E2E runs
// against `vite dev` (which already proxies via VITE_API_PROXY_TARGET, see vite.config.ts)
// alongside a real AdonisJS dev server, both on dedicated ports against a disposable SQLite file
// so a normal `pnpm dev` session's data is never touched.
const API_PORT = 3334;
const WEB_PORT = 5174;
const DB_FILE = 'tmp/e2e.sqlite3';

export default defineConfig({
	webServer: [
		{
			command: `rm -f ${DB_FILE} && DATABASE_FILENAME=${DB_FILE} node ace migration:run --force && DATABASE_FILENAME=${DB_FILE} PORT=${API_PORT} node ace serve`,
			cwd: '../api',
			port: API_PORT,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000
		},
		{
			command: `npx vite dev --port ${WEB_PORT}`,
			port: WEB_PORT,
			env: { VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}` },
			reuseExistingServer: !process.env.CI,
			timeout: 60_000
		}
	],
	use: { baseURL: `http://localhost:${WEB_PORT}` },
	testMatch: '**/*.e2e.{ts,js}'
});
