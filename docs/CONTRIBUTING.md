# Contributing to RepoCanon

For product usage (install, commands, MCP setup) see [../README.md](../README.md). For design, threat model and roadmap see [ARCHITECTURE.md](ARCHITECTURE.md). This doc is for people working on RepoCanon itself.

## Running from source
```bash
git clone https://github.com/awalhadi/repo-canon.git && cd repo-canon
npm test
npm link                    # global `repocanon` command pointing at this checkout
# no permission for npm link? use an alias instead:
echo "alias repocanon='node $PWD/bin/repocanon.js'" >> ~/.zshrc && source ~/.zshrc
```
For an MCP client, point it at the checkout: `"command": "node", "args": ["/abs/path/to/repo-canon/bin/repocanon.js", "mcp"]`.

## Embedding as a library
```js
const repocanon = require('repocanon');   // src/index.js — the same services the CLI uses
const report = repocanon.sync('/path/to/project', {});
```

## Project layout
```
bin/repocanon.js           entrypoint → cli/router.js
src/core/                  safe git, fs, frontmatter, config, stack detection, module resolver, typed errors
src/services/               one *.service.js per feature — init, analyze, doctor, status, sync, pack, prompt, facts, hook
src/cli/                    argv parsing, one *.cmd.js per subcommand, help/format
src/mcp/                    stdio MCP server + tool schemas (reuses the same services)
src/index.js                public facade for embedding
templates/                  .ai/ doc templates + fill/update prompt templates
test/architecture.test.js   layering, dead-code and circular-require guardrails (see ARCHITECTURE.md §7)
test/unit.test.js           fast, direct tests of core/ and services/
test/cli.e2e.test.js        black-box tests of the real CLI against temp git repos
```

## Running tests
`npm test` must stay green, including `test/architecture.test.js` — it will fail the build if a new file reaches into a layer it isn't allowed to, or if logic gets duplicated back into a flat file at `src/` root.

## Releasing
`server.json` is the [MCP Registry](https://registry.modelcontextprotocol.io) listing. Its `name` must equal `mcpName` in `package.json`, and its two `version` fields must equal the version you publish (`npm test` checks the first two rules).

```bash
npm version 0.5.1 --no-git-tag-version   # bump package.json (and package-lock.json if present)
# set the same version in server.json ("version", packages[0].version) and
# plugins/repocanon/.claude-plugin/plugin.json ("version" and the repocanon@^x pin in mcpServers + hooks/hooks.json)
git commit -am "release: 0.5.1" && git tag v0.5.1
npm publish                              # runs the tests first (prepublishOnly)
mcp-publisher login github               # once; install: brew install mcp-publisher
mcp-publisher publish                    # reads server.json; npm must already have this version
git push --follow-tags
```
Then paste the CHANGELOG section into a GitHub release for the tag.
