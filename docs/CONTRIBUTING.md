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
The full step-by-step guide is in [PUBLISHING.md](PUBLISHING.md): version bumps, `npm publish`, `mcp-publisher publish` to the MCP Registry, tags, the GitHub release, the moving Action tag, optional CI automation and troubleshooting.

In short:

```bash
npm version X.Y.Z --no-git-tag-version   # then the same version in server.json (2 fields) and the plugin (version + 3 pins)
npm test && git commit -am "release: X.Y.Z" && git tag vX.Y.Z
npm publish                              # npm first: the registry checks it
mcp-publisher login github && mcp-publisher publish
git push origin main --follow-tags
git tag -f vX.Y && git push -f origin vX.Y   # the Action's moving tag
```

README examples are generated from the real CLI: after changing command output, run `node scripts/readme-examples.js`, paste the blocks into the README (the test says which one is stale), and refresh the screenshot with `node scripts/render-terminal-svg.js status sync > docs/assets/terminal.svg`.
