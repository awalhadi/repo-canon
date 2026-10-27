'use strict';

const path = require('path');
const { read, renderTemplate } = require('../core/fs');
const { readManagedBlock, upsertManagedBlock } = require('../core/blocks');
const { stripFrontmatter } = require('../core/frontmatter');
const { loadConfig } = require('../core/config');
const { detectProject } = require('../core/detector');
const { estimateTokens } = require('../core/tokens');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');
const DIGEST_TOKEN_BUDGET = 700;

/**
 * Bullet lines a person wrote in a doc: no headings, quotes, placeholders or TODOs.
 *
 * @param {string|null} text
 * @returns {string[]}
 */
function getAuthoredBullets(text) {
  return stripFrontmatter(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^[-*] \S/.test(line) && !/\bTODO\b/.test(line) && !/^[-*] \S+:\s*$/.test(line))
    .map(line => `- ${line.slice(2)}`);
}

/**
 * One line per decision: "- D-002 Title: what was decided".
 *
 * @param {string|null} text - DECISIONS.md
 * @returns {string[]}
 */
function getDecisionLines(text) {
  const lines = [];
  const entries = stripFrontmatter(text || '').split(/^## /m).slice(1);
  for (const entry of entries) {
    const [heading, ...body] = entry.split('\n');
    const title = heading.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '').trim();
    const decision = body.map(l => l.trim()).find(l => /^- Decision:\s*\S/.test(l));
    if (!decision || /\bTODO\b/.test(title)) continue;
    lines.push(`- ${title}: ${decision.replace(/^- Decision:\s*/, '')}`);
  }
  return lines;
}

/**
 * The rules and decisions agents must follow, taken from .ai/CONVENTIONS.md and
 * .ai/DECISIONS.md and kept inside a token budget. Agents reliably read what is in
 * their entry file; a pointer to another file is often skipped.
 *
 * @param {string} root - Project root directory
 * @param {{ maxTokens?: number }} [options={}]
 * @returns {string} markdown section, or '' when the docs hold nothing yet
 */
function buildRulesDigest(root, options = {}) {
  const maxTokens = options.maxTokens || DIGEST_TOKEN_BUDGET;
  const conventions = getAuthoredBullets(read(path.join(root, '.ai', 'CONVENTIONS.md')));
  const decisions = getDecisionLines(read(path.join(root, '.ai', 'DECISIONS.md')));
  if (!conventions.length && !decisions.length) return '';

  const header = '## Project rules (from `.ai/CONVENTIONS.md` and `.ai/DECISIONS.md` — open them for the why)';
  const kept = [header];
  const more = '- … more in `.ai/CONVENTIONS.md` and `.ai/DECISIONS.md`.';
  for (const line of [...conventions, ...decisions]) {
    if (estimateTokens([...kept, line, more].join('\n')) > maxTokens) {
      kept.push(more);
      break;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * The managed block RepoCanon keeps in AGENTS.md: commands, the rules digest
 * (unless `"entryDigest": false`) and how to use the knowledge layer.
 *
 * @param {string} root - Project root directory
 * @returns {string}
 */
function renderEntryBlock(root) {
  const detected = detectProject(root);
  const commands = [['Run', detected.run], ['Test', detected.test], ['Lint', detected.lint]]
    .filter(([, command]) => command && command !== 'TODO')
    .map(([label, command]) => `${label}: \`${command}\``)
    .join(' | ');
  const digest = loadConfig(root).entryDigest === false ? '' : buildRulesDigest(root);
  const template = read(path.join(TEMPLATES_DIR, 'AGENTS.md')) || '';
  return renderTemplate(template, {
    name: detected.name,
    stack: detected.stacks.join(', ') || 'unknown',
    commands: commands || 'Commands: see `.ai/PROJECT.md`',
    digest: digest ? `\n${digest}\n` : ''
  }).replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * Rewrites the AGENTS.md block after the rules or decisions changed. Does nothing
 * when the project has no RepoCanon block in AGENTS.md.
 *
 * @param {string} root
 * @returns {boolean} whether AGENTS.md changed
 */
function refreshEntryBlock(root) {
  const file = path.join(root, 'AGENTS.md');
  const current = readManagedBlock(file);
  const wanted = renderEntryBlock(root);
  if (current === null || current === wanted) return false;
  upsertManagedBlock(file, wanted);
  return true;
}

module.exports = {
  buildRulesDigest,
  renderEntryBlock,
  refreshEntryBlock,
  DIGEST_TOKEN_BUDGET
};
