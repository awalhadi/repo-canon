'use strict';

const path = require('path');
const { read, renderTemplate } = require('../core/fs');
const { readManagedBlock, upsertManagedBlock } = require('../core/blocks');
const { stripFrontmatter } = require('../core/frontmatter');
const { loadConfig } = require('../core/config');
const { detectProject } = require('../core/detector');
const { estimateTokens } = require('../core/tokens');
const { listDecisions, LEGACY_DECISIONS_DOC } = require('../core/decisions');
const { getKnowledgeDocs } = require('./status.service');
const { ANNOTATION } = require('../core/claims');

/** Docs the entry file may point to, in reading order, with what each one answers. */
const DETAIL_DOCS = [
  ['PROJECT', 'what the project is, its boundaries and external services'],
  ['DOMAIN', 'business rules, states and glossary'],
  ['CONVENTIONS', 'coding conventions (the rules above come from it)'],
  ['STATE', 'what is in progress and recent changes']
];

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
    .map(line => `- ${line.slice(2).replace(ANNOTATION, '').trim()}`);
}

/**
 * Whether a doc holds anything a person or agent wrote: a line that is not a heading,
 * quote, table rule, TODO or a line of the doc's own template (`{{…}}` matches anything).
 * Template-only docs are left out of the entry file so agents aren't sent into them.
 *
 * @param {string|null} text
 * @param {string|null} template
 * @returns {boolean}
 */
function isFilled(text, template) {
  if (!text) return false;
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stubs = stripFrontmatter(template || '').split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => new RegExp(`^${l.split(/\{\{[^}]*\}\}/).map(escape).join('.*')}$`));
  return stripFrontmatter(text).split('\n').map(l => l.trim()).some(line =>
    line && !/^(#|>|\|)/.test(line) && !/\bTODO\b/.test(line) && !/^[-*]\s*$/.test(line) && !stubs.some(re => re.test(line)));
}

/**
 * The "more detail" list of the entry file: only docs that have content.
 *
 * @param {string} root - Project root directory
 * @returns {string[]} markdown bullets
 */
function getDetailDocLines(root) {
  const lines = [];
  const moduleTemplate = read(path.join(TEMPLATES_DIR, 'module.md'));
  const modules = getKnowledgeDocs(root).filter(d => d.rel.startsWith('.ai/modules/') && isFilled(d.text, moduleTemplate));
  // No count: AGENTS.md would change every time another module doc is filled
  if (modules.length) lines.push('- `.ai/modules/` — one doc per area: purpose, invariants, flow and gotchas');
  for (const [name, answers] of DETAIL_DOCS) {
    if (isFilled(read(path.join(root, '.ai', `${name}.md`)), read(path.join(TEMPLATES_DIR, `${name}.md`)))) {
      lines.push(`- \`.ai/${name}.md\` — ${answers}`);
    }
  }
  if (listDecisions(root).some(d => d.decision)) lines.push('- `.ai/decisions/` (and older `.ai/DECISIONS.md`) — why things are built this way');
  return lines;
}

/**
 * One line per decision still in force, newest first: "- Title: what was decided"
 * ("- D-002 Title: …" for legacy numbered entries). Superseded decisions are left out.
 *
 * @param {string} root - Project root directory
 * @returns {string[]}
 */
function getDecisionLines(root) {
  const records = listDecisions(root);
  const superseded = new Set(records.map(d => d.supersedes).filter(Boolean));
  return records
    .filter(d => d.decision && !superseded.has(d.id))
    .map(d => `- ${d.rel === LEGACY_DECISIONS_DOC ? `${d.id} ` : ''}${d.title}: ${d.decision}`);
}

/**
 * The rules and decisions agents must follow, taken from .ai/CONVENTIONS.md,
 * .ai/decisions/ and the older .ai/DECISIONS.md, and kept inside a token budget. Agents reliably read what is in
 * their entry file; a pointer to another file is often skipped.
 *
 * @param {string} root - Project root directory
 * @param {{ maxTokens?: number }} [options={}]
 * @returns {string} markdown section, or '' when the docs hold nothing yet
 */
function buildRulesDigest(root, options = {}) {
  const maxTokens = options.maxTokens || DIGEST_TOKEN_BUDGET;
  const conventions = getAuthoredBullets(read(path.join(root, '.ai', 'CONVENTIONS.md')));
  const decisions = getDecisionLines(root);
  if (!conventions.length && !decisions.length) return '';

  const header = '## Project rules (from `.ai/CONVENTIONS.md` and `.ai/decisions/` — open them for the why)';
  const kept = [header];
  const more = '- … more in `.ai/CONVENTIONS.md` and `.ai/decisions/`.';
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
    digest: digest ? `\n${digest}\n` : '',
    docs: getDetailDocLines(root).join('\n')
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
  isFilled,
  buildRulesDigest,
  renderEntryBlock,
  refreshEntryBlock,
  DIGEST_TOKEN_BUDGET
};
