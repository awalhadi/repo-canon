# Publishing a RepoCanon release

A step-by-step guide for maintainers. One release goes out through five channels, in this order:

| # | Channel | What users get | Command |
|---|---|---|---|
| 1 | **npm** | `npx repocanon …` | `npm publish` |
| 2 | **MCP Registry** | RepoCanon listed at registry.modelcontextprotocol.io as `io.github.awalhadi/repocanon` | `mcp-publisher publish` |
| 3 | **Git tags** | the source for that version | `git push --follow-tags` |
| 4 | **GitHub release** | release notes on the repo page | GitHub UI or `gh release create` |
| 5 | **Action tag** | `uses: awalhadi/repo-canon@v0.6` picks up the release | `git tag -f v0.6` |

The Claude Code plugin needs no separate publish. The plugin and its marketplace are files in this repo, so users get them with `git push`, and the plugin's `npx repocanon@^x.y.z` pin pulls the npm package.

> **Order matters.** The MCP Registry stores metadata only and checks that the npm package exists, so **npm comes first**. You can't publish the same version twice to either npm or the registry: bump the version instead of retrying.

---

## 0. One-time setup

| You need | How |
|---|---|
| npm account with 2FA, and owner of the `repocanon` package | `npm adduser` (or `npm login`), then `npm whoami` should print your username |
| GitHub account **`awalhadi`** | owns the `io.github.awalhadi/*` namespace in the MCP Registry |
| `mcp-publisher` CLI | see below |
| Optional: `gh` CLI | to create GitHub releases from the terminal |

Install `mcp-publisher` with one of these ([official quickstart](https://modelcontextprotocol.io/registry/quickstart)):

```bash
# macOS / Linux, with Homebrew
brew install mcp-publisher

# macOS / Linux, prebuilt binary
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

# check it
mcp-publisher --help
```

On Windows (PowerShell), the official command downloads `mcp-publisher_windows_amd64.tar.gz` (or `_arm64`) from the same release page. Put `mcp-publisher.exe` on your `PATH`.

Two things link the npm package to the registry entry. They are already set up in this repo; never change one without the other:

- `package.json` → `"mcpName": "io.github.awalhadi/repocanon"`
- `server.json` → `"name": "io.github.awalhadi/repocanon"`

`npm test` fails if these two drift apart.

---

## 1. Prepare the release (on `main`)

Set the **same version** in every place below. The examples use `0.6.1`.

| File | Field |
|---|---|
| `package.json` | `"version"`, set with `npm version 0.6.1 --no-git-tag-version` |
| `server.json` | `"version"` **and** `packages[0].version` |
| `plugins/repocanon/.claude-plugin/plugin.json` | `"version"` and the pin `repocanon@^0.6.1` in `mcpServers` |
| `plugins/repocanon/hooks/hooks.json` | both `repocanon@^0.6.1` pins |
| `CHANGELOG.md` | rename `## 0.6.1 — unreleased` to `## 0.6.1 — YYYY-MM-DD` |

Then check everything:

```bash
npm test                                  # all green
claude plugin validate plugins/repocanon  # optional, if you have Claude Code
claude plugin validate .
npm pack --dry-run                        # only bin/, src/, templates/, a few docs: no bench/, plugins/, tests
git grep -n "0\.6\.0" -- server.json plugins package.json   # should print nothing
git commit -am "release: 0.6.1"
git tag v0.6.1
```

---

## 2. Publish to npm

```bash
npm publish            # prepublishOnly runs the tests first
npm view repocanon version
```

Expected: `npm view` prints `0.6.1`. A new version can take a minute to appear. Wait for it before step 3, because the registry checks npm.

---

## 3. Publish to the MCP Registry (`mcp-publisher publish`)

From the repository root, where `server.json` lives:

```bash
mcp-publisher login github     # once per machine, or when your token expires
mcp-publisher publish
```

**What happens at login:**

```text
Logging in with github...

To authenticate, please:
1. Go to: https://github.com/login/device
2. Enter code: ABCD-1234
3. Authorize this application
Waiting for authorization...
```

Open the link, sign in as **awalhadi**, and enter the code. The terminal then shows `✓ Successfully logged in`.

**What happens at publish:** `mcp-publisher` reads `server.json` and validates it against the schema. It then checks npm: `repocanon@0.6.1` must exist and its `mcpName` must equal `server.json`'s `name`. Then it registers the entry:

```text
Publishing to https://registry.modelcontextprotocol.io...
✓ Successfully published
✓ Server io.github.awalhadi/repocanon version 0.6.1
```

**Verify:**

```bash
curl -s "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.awalhadi/repocanon"
```

The JSON should contain `"name":"io.github.awalhadi/repocanon"` and `"version":"0.6.1"`. MCP clients and directories that read the registry pick it up from there.

---

## 4. Push, release notes, Action tag

```bash
git push origin main --follow-tags          # pushes main and v0.6.1

# GitHub release: paste the CHANGELOG section as the notes
gh release create v0.6.1 --title "v0.6.1" --notes-file release-notes.md
#   (or: GitHub → Releases → Draft a new release → choose tag v0.6.1)

# Move the Action's major tag so `uses: awalhadi/repo-canon@v0.6` gets this release
git tag -f v0.6 && git push -f origin v0.6
```

Only the moving `v0.6` tag is ever force-pushed. Never force-push a `vX.Y.Z` tag or `main`. For a new minor version (0.7.0), create a new `v0.7` tag and update the README's `uses:` line.

---

## 5. After publishing: a two-minute smoke test

```bash
cd "$(mktemp -d)" && git init -q && echo '{}' > package.json
npx -y repocanon@latest --version     # 0.6.1
npx -y repocanon@latest init --targets=claude --yes
npx -y repocanon@latest doctor
```

In Claude Code, `/plugin marketplace update repocanon` picks up the new plugin version.

---

## 6. Optional: let GitHub Actions publish

This is the [official pattern](https://modelcontextprotocol.io/registry/github-actions): push a `v*` tag, and CI publishes to npm and then to the MCP Registry. OIDC login needs **no stored GitHub secret**; only `NPM_TOKEN` (an npm automation token) is required.

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ["v*.*.*"]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write          # OIDC for the MCP Registry (and npm provenance)
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: "lts/*"
          registry-url: "https://registry.npmjs.org"
      - name: Versions match the tag
        run: |
          V="${GITHUB_REF_NAME#v}"
          test "$(node -p "require('./package.json').version")" = "$V"
          test "$(node -p "require('./server.json').version")" = "$V"
      - run: npm test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Install mcp-publisher
        run: curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz mcp-publisher
      - run: ./mcp-publisher login github-oidc
      - run: ./mcp-publisher publish
```

You still prepare the release (step 1), push the tag, write the GitHub release and move `v0.6`.

---

## Troubleshooting

| Message or symptom | Cause | Fix |
|---|---|---|
| `Registry validation failed for package` / `Package validation failed` | npm doesn't have this version yet, or its `mcpName` differs from `server.json`'s `name` | Wait for `npm view repocanon version` to show it; check both names match |
| `You do not have permission to publish this server` | Logged in as a GitHub user other than `awalhadi` | `mcp-publisher logout`, then `mcp-publisher login github` as awalhadi |
| `Invalid or expired Registry JWT token` | Login expired | `mcp-publisher login github` |
| Version already exists (npm `403` / registry conflict) | That version was published before | Bump to the next patch version; you can't republish a version |
| Schema / validation error from `publish` | `server.json` doesn't match the schema in its `$schema` URL | Compare with the [quickstart example](https://modelcontextprotocol.io/registry/quickstart); keep `$schema` current |
| `Authentication failed` in Actions | Missing `id-token: write` | Add it under `permissions` |
| `npm ERR! 403` on publish | Not logged in, missing 2FA code, or not an owner | `npm whoami`; `npm owner ls repocanon` |
| `uses: awalhadi/repo-canon@v0.6` runs old code | The `v0.6` tag wasn't moved | `git tag -f v0.6 && git push -f origin v0.6` |

The MCP Registry is in preview, so if a command changes, the [official docs](https://modelcontextprotocol.io/registry/quickstart) are the source of truth.
