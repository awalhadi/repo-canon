'use strict';

const pkg = require('../../package.json');
const { STATUS_ICONS } = require('../core/constants');

/**
 * Prints data as formatted JSON to stdout.
 * @param {any} data
 */
function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Returns formatted help text for the RepoCanon CLI.
 * @returns {string}
 */
function getHelpText() {
  return `repocanon ${pkg.version} — project knowledge layer (.ai/) for AI coding agents

  init [--force]           .ai/, AGENTS.md + IDE pointers (managed blocks, existing content preserved), .repocanon.json
  analyze [--scaffold]     refresh module/path map in .ai/INDEX.md (--scaffold: module doc stubs)
  doctor [--ci] [--json]   lint the knowledge layer: size caps, TODOs, broken paths, IDE pointers, token budget
  status [--ci] [--json]   docs fresh/stale/broken/unverified vs git
  sync [--write] [--since=ref] [--json]
                           changed code since docs were verified → what to update
  context [words…] [--files=a,b] [--max=4000]
                           print a budgeted context pack for a task (what an agent should read)
  stamp [name]             set verified_at = current commit (after confirming a doc)
  hook                     pre-commit warning (never blocks)
  prompt fill [--compact]  rich, evidence-loaded brief to paste into your agent (--compact: short form)
  prompt update            prompt for syncing docs after code changes
  mcp                      MCP server on stdio (tools: rc_context/cf_context, rc_module, rc_find_owner, rc_status)

  global: --root=<dir> run against another directory | --version`;
}

module.exports = {
  STATUS_ICONS,
  printJson,
  getHelpText
};
