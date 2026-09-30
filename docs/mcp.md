# MCP (Model Context Protocol)

EveryList ships an [MCP](https://modelcontextprotocol.io) server so AI clients — Claude, Claude Code, Cursor, and anything else that speaks MCP — can read and edit your lists. It runs **inside the same container** as the rest of the app, on the same origin as the web UI, and is authenticated by the same kind of scoped [Personal Access Token](../README.md#personal-access-tokens) the Alexa and Home Assistant integrations use. There is no separate service to deploy, and no new port: the endpoint is `/mcp`.

Because it's PAT-gated, an MCP client only ever sees the lists a token grants it, at the role that token carries (capped below `owner`, so it can never mint or revoke tokens or touch anything instance-wide). Mint a token for exactly the list(s) you want the AI to reach — see [Connecting a client](#connecting-a-client) below.

## Setting up a token

1. Open your EveryList instance and go to **Settings → Access Tokens**.
2. Mint a token, name it something like `Claude`, pick the list(s) it should reach, and choose `editor` (read **and** write) or `viewer` (read-only).
3. Copy the token — it's shown once, prefixed `elt_`.

That's the whole setup on the server side; nothing needs enabling. If you later want to add or remove lists, edit the token's grants in the same screen and the change takes effect immediately.

## Connecting a client

Different MCP clients connect differently. EveryList speaks the **stateless HTTP transport** (protocol `2026-07-28`) and also keeps the legacy `initialize`/`MCP-Session-Id` lifecycle working for older clients, so both generations connect.

### Remote HTTP clients

Point the client at `https://<your-instance>/mcp` and send the token as a bearer header:

- **URL:** `https://your-everylist-host/mcp`
- **Header:** `Authorization: Bearer elt_…`

Many current desktop and editor clients (Claude, Claude Code, Cursor, VS Code, …) accept a remote MCP server URL plus custom headers directly. Use that first — it's the simplest path and needs no local process.

### Desktop clients that only speak stdio

If your client can only launch a local command (no remote URL support), bridge to the HTTP endpoint with the generic [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) shim. For Claude Desktop's config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "everylist": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://your-everylist-host/mcp",
        "--header",
        "Authorization: Bearer elt_your_token_here"
      ]
    }
  }
}
```

Treat that config file as a secret — it holds a live token.

### Local development

While running the API locally (`pnpm --filter @everylist/api dev`), the package's inspector is available for browsing and testing the tools without a full client:

```bash
pnpm --filter @everylist/api exec node ace mcp:inspector
```

(The inspector writes a `.mcp-inspector.json` catalog, which is gitignored.)

## What the AI can do

The tool set is deliberately curated — a small, model-friendly set rather than one tool per REST endpoint. Tools accept either a list id or an exact list name, so the model can work naturally ("add milk to Groceries").

| Tool | What it does | Access needed |
| ---- | ------------ | ------------- |
| `list_lists` | Discover which lists the token can reach, with open-item counts. Start here. | viewer |
| `get_list` | Read one list's items, in display order, with its categories. | viewer |
| `get_item` | Read one item's full details, or one of its sub-tasks. | viewer |
| `search_items` | Find items by name (case-insensitive substring) on one list or across every reachable list. | viewer |
| `add_item` | Add an item by name (re-adding an existing name reuses its row — no duplicates). | editor |
| `update_item` | Change an item's name, quantity, notes, price, deadline, category or store. | editor |
| `complete_item` | Check an item off (repeating items spawn their next occurrence). | editor |
| `uncomplete_item` | Reopen a checked item. | editor |
| `remove_item` | Soft-delete an item (restorable, and re-adding the name restores it automatically). | editor |
| `create_list` | Create a new list owned by your account. | any token (viewer or editor) |
| `add_subtask` | Add a checklist step to an item. | editor |

Beyond tools, the server also exposes one **resource**, `everylist://lists/{listId}`, returning the same open-item payload `get_list` does, for clients that read resources rather than call tools.

Notes:

- **`create_list` creates a list that the calling token is *not* granted.** A token's grants are fixed at mint time, so a list made through MCP won't appear to that token until you re-scope it in `Settings → Access Tokens`. The tool says so in its result. (`viewer`-granted tokens aren't restricted from creating a list — that matches what the REST API already allows any authenticated account, and the new list is owned by your account, not the token.)
- **Writes behave exactly like the app's own writes.** An MCP add/complete/remove is the same server-side mutation the UI performs, including the open-item limit, sub-task gate, learned auto-categorization, recurring-item spawning, and the realtime broadcast that keeps your other devices in sync.
- **Reads work on `viewer`-granted lists; every write needs `editor`.** A list the token has no grant on is reported as "not found" — indistinguishable from a wrong list name, so a token can't probe for lists it can't see.

## Security notes

- The endpoint is authenticated by the `pat` bearer token only — a normal login/session token cannot use it, matching the "external, unattended client" model the Alexa and Home Assistant paths use.
- Tokens are capped below `owner`: an MCP client can never mint/revoke tokens, change server settings, manage users, or reach instance-wide data.
- `Settings → Access Tokens` revokes a token with immediate effect — no redeploy.
- The server logs never contain token values.

## Under the hood

The endpoint is implemented with [`@jrmc/adonis-mcp`](https://packages.adonisjs.com/packages/adonis-mcp) and lives in [`apps/api/app/mcp/`](../apps/api/app/mcp) (tools + resource), with shared access/authorization helpers in [`apps/api/app/services/mcp/`](../apps/api/app/services/mcp). All authorization funnels through the same `ListPolicy` every HTTP route uses. See [`foundational/PLAN_32_PHASE_MCP_SERVER.md`](../foundational/PLAN_32_PHASE_MCP_SERVER.md) for the design and decisions.

Each instance reports its own server identity (name `everylist`, its real version) and serves the endpoint offline — no external calls.
