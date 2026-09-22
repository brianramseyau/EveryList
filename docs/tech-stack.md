# Tech stack

| Layer        | Choice                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Frontend     | [SvelteKit](https://kit.svelte.dev) (Svelte 5, static adapter) + [Flowbite Svelte](https://flowbite-svelte.com) + Tailwind CSS |
| PWA          | [vite-plugin-pwa](https://vite-pwa-org.netlify.app) (Workbox) + [Dexie.js](https://dexie.org) offline store                    |
| Backend      | [AdonisJS 6](https://adonisjs.com) — Lucid ORM, VineJS validation, Transmit (SSE)                                              |
| Database     | SQLite 3 (WAL) via `better-sqlite3` — single file, no external DB service                                                      |
| Shared types | `packages/shared` — DTOs/contracts shared between API and web                                                                  |
| Testing      | Japa + c8 (backend), Vitest + Testing Library + Playwright (frontend) — 100% coverage policy on unit/integration               |
| Deployment   | Single Docker image, LinuxServer.io-style (`s6-overlay`, `PUID`/`PGID`), published to GHCR                                     |
| Native shell | [Capacitor](https://capacitorjs.com) (iOS + Android) — wraps the same SvelteKit build, no separate native codebase             |

Full rationale for each choice is in [§4 of the plan](../foundational/PLAN_00_FOUNDATIONAL_PLAN.md#4-technology-stack).
