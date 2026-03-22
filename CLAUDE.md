## Tool Usage Rules — Always Follow

### Code Analysis
- ALWAYS use LSP tools for code analysis, diagnostics, type checking, and symbol resolution.
- Never guess at types, definitions, or errors when LSP tools are available. Use them first.
- If LSP tools are unavailable or throw an auth error: STOP and ask the user what to do.
  Do not fall back to any other method.

### Web Search
- ALWAYS use Firecrawl for any web search, URL fetching, or documentation lookup.
- Do not use generic Bash curl/wget for web content retrieval if Firecrawl is available.
- If Firecrawl is unavailable or throws an auth error: STOP and ask the user how to proceed.
  Do not fall back to any other method until explicitly told to do so.

### Git Operations
- ALL git write operations (commits, push, PRs, issues, releases) go through the `github` MCP server.
- The github MCP server is pre-authenticated as the bot (`k5qkop-bot`) via GIT_BOT_TOKEN.
- Never use raw `git` bash commands or `gh` CLI for write operations unless MCP is unavailable.
- If you must fall back to bash git/gh: the PreToolUse hook will automatically inject bot identity.
  You do NOT need to set git config or switch credentials manually.
- All commits must appear as `k5qkop-bot`. Never commit under the user's personal identity.
- If the github MCP server is unavailable or throws an auth error: STOP and tell the user.
  Do not fall back to any other method without explicit permission.
- Before any git commit or push, check `git branch --merged main` and block if the current
  branch is already merged.

### Bash Commands
- NEVER chain multiple commands with `&&`, `||`, or `;` in a single Bash tool call.
- Run each command as a separate Bash tool call so that whitelisted commands
  don't require manual approval.
- If commands are independent, run them as parallel tool calls in the same message.

## AWS Documentation

When working on any AWS-related tasks, always use the `awslabs-aws-documentation-mcp-server`
and `awslabs-core-mcp-server` MCP tools before responding. Use them to look up service
documentation, API references, and best practices rather than relying solely on training
knowledge — AWS APIs and features change frequently and the MCP servers always reflect
the latest guidance. For any task involving AWS services, infrastructure, SDKs, or CLI
commands, consult these tools first, even if you believe you already know the answer.

## Environment & Installation Rules

### Never install directly on the host system
- If ANY task requires installing packages, runtimes, compilers, dependencies, or system tools,
  ALWAYS assume the work should happen inside a container (Docker or similar).
- Do NOT run `apt install`, `brew install`, `npm install -g`, `pip install` (system-wide),
  or any other system-level installation directly on the host machine.
- Instead: automatically propose a Dockerfile or docker-compose.yml that covers the requirement,
  and wait for approval before proceeding.
- This applies even if the install command looks harmless or temporary.
- When in doubt, ask "should this go in a container?" — the default answer is YES.

### Detect and respect existing container setup
- At the start of any task, check if a Dockerfile, docker-compose.yml, or .dockerignore
  exists in the repo root or any parent directory.
- If found AND the task involves running, building, installing, or testing anything:
  STOP and ask before proceeding.
- Do not assume the answer is yes automatically — always ask explicitly, every time.
- Only proceed after receiving a clear answer.
- If the answer is yes: all commands, builds, installs, and test runs must happen
  inside that container, not on the host.


## Interactive Extension Testing (Claudezilla)

A patched version of Claudezilla at `/home/lexey/claudezilla/` provides browser automation
that works with our extension's container tab interception.

### Setup (each session)
1. Load Claudezilla as temporary add-on: `about:debugging` → Load Temporary Add-on →
   `/home/lexey/claudezilla/extension/manifest.json`
2. Click Claudezilla toolbar icon to connect
3. Call `firefox_set_private_mode(false)` — extension doesn't work in private windows

### Testing workflow
- `firefox_create_window(url)` → extension intercepts, moves tab to container
- `firefox_query_all_tabs()` → find the container tab by `cookieStoreId`
- All commands (`get_content`, `evaluate`, `screenshot`, `click`, `type`, etc.)
  accept any `tabId` — not limited to Claudezilla's pool window
- After extension source changes: reload from `about:debugging`

### Important
- The patched Claudezilla is NOT from AMO — it's the local version with cross-window support
- The native host shebang uses an absolute fnm node path (Firefox doesn't inherit shell PATH)
- Content scripts may need a page navigation to inject on pre-existing tabs

These are standing instructions. Do not wait to be reminded. Apply them every session.
