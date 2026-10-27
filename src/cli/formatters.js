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

  init [--targets=a,b|all|none] [--yes] [--prune] [--force]
                           .ai/, AGENTS.md, .repocanon.json + pointer files for the AI tools you pick
                           (interactive picker in a terminal; re-run any time to add/remove tools)
  analyze [--scaffold]     refresh module/path map in .ai/INDEX.md (--scaffold: module doc stubs)
  doctor [--ci] [--json]   lint the knowledge layer: size caps, TODOs, broken paths, IDE pointers, token budget
  status [--ci] [--json]   docs fresh/stale/broken/unverified vs git
  sync [--write] [--since=ref] [--json]
                           changed code since docs were verified → what to update
  context [words…] [--files=a,b] [--max=4000]
                           print a budgeted context pack for a task (what an agent should read)
  stamp <name…> | --all [--force]
                           set verified_at = current commit on docs you re-checked
                           (refuses when their code has uncommitted changes)
  secrets [--staged] [--json]
                           scan AGENTS.md and .ai/ (or their staged versions) for API keys, tokens, passwords
  hook                     pre-commit hook: warns on undocumented code changes, blocks secrets in .ai/ docs
  prompt fill [--compact]  rich, evidence-loaded brief to paste into your agent (--compact: short form)
  prompt update            prompt for syncing docs after code changes
  mcp                      MCP server on stdio (tools: rc_context, rc_module, rc_find_owner, rc_status,
                           rc_prepare_fill, rc_sync_report)

  global: --root=<dir> run against another directory | --version`;
}

module.exports = {
  STATUS_ICONS,
  printJson,
  getHelpText
};
