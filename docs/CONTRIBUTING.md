# Contributing to RepoCanon

For product usage (install, commands, MCP setup) see [../README.md](../README.md). For design, threat model and roadmap see [ARCHITECTURE.md](ARCHITECTURE.md). This doc is for people working on RepoCanon itself.

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
