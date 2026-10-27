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
  rules [--check] [--json]  write per-module rule files (Cursor .mdc globs, Copilot applyTo, optional nested AGENTS.md)
                           that load only while editing that module; --check exits 1 if out of date
  skills [--check] [--json] write .ai/skills/rc-verify-change (this repo's own lint/typecheck/test commands) and copy every
                           .ai/skills/<name>/SKILL.md to .claude/skills and .agents/skills; --check exits 1 if out of date
  setup [tool…|all] [--json]
                           register the RepoCanon MCP server in each tool's config (default: the tools init set up)
  adopt [--dry-run] [--move] [--json]
                           import CLAUDE.md, .cursorrules, Cursor/Copilot rules, GEMINI.md, .windsurfrules, .clinerules,
                           memory-bank/ into .ai/ (drops inferable content and secrets); --move then retires the originals
  analyze [--scaffold]     refresh module/path map in .ai/INDEX.md (--scaffold: module doc stubs)
  doctor [--ci] [--strict] [--format=github] [--json]
                           lint the knowledge layer: size caps, TODOs, broken paths, IDE pointers, token budget
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
  report [--base=ref] [--format=markdown|json]
                           pull-request summary: modules changed with/without their docs, Freshness Score
  hook                     pre-commit hook: warns on undocumented code changes, blocks secrets in .ai/ docs
  prompt fill [--compact]  rich, evidence-loaded brief to paste into your agent (--compact: short form)
  prompt update            prompt for syncing docs after code changes
  agent-hook <session-start|stop>
                           output for agent hooks (used by the Claude Code plugin): session context / end-of-turn doc nudge
  mcp                      MCP server on stdio (tools: rc_context, rc_module, rc_find_owner, rc_status,
                           rc_prepare_fill, rc_sync_report)

  global: --root=<dir> run against another directory | --version`;
}

/**
 * One GitHub Actions workflow command, so a finding shows inline on the PR's
 * Files tab. Escapes per GitHub's rules: % \r \n in the message, plus , and : in properties.
 *
 * @param {'error'|'warn'|'info'} level
 * @param {string} msg
 * @param {{ file?: string, line?: number }} [where={}]
 * @returns {string}
 */
function formatGithubAnnotation(level, msg, where = {}) {
  const command = level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'notice';
  const escapeData = value => String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const escapeProperty = value => escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
  const props = [
    where.file ? `file=${escapeProperty(where.file)}` : null,
    where.line ? `line=${escapeProperty(where.line)}` : null,
    'title=RepoCanon'
  ].filter(Boolean).join(',');
  return `::${command} ${props}::${escapeData(msg)}`;
}

/**
 * GitHub annotations when asked for, or automatically in GitHub Actions CI runs.
 *
 * @param {{ options: Record<string, string>, isCi: boolean }} context
 * @returns {boolean}
 */
function wantsGithubFormat(context) {
  return context.options.format === 'github' || (context.isCi && process.env.GITHUB_ACTIONS === 'true' && !context.options.format);
}

module.exports = {
  formatGithubAnnotation,
  wantsGithubFormat,
  STATUS_ICONS,
  printJson,
  getHelpText
};
