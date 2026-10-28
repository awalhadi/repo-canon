'use strict';

const fs = require('fs');
const path = require('path');
const { read, toSlug } = require('./fs');
const { parseFrontmatter, stripFrontmatter } = require('./frontmatter');

/**
 * One file per decision, so two branches or agents recording decisions never touch the
 * same lines. The older single-file format in DECISIONS.md is still read.
 */
const DECISIONS_DIR = '.ai/decisions';
const LEGACY_DECISIONS_DOC = '.ai/DECISIONS.md';
const LEGACY_HEADING = /^## (D-(\d+)) (.*?)(?: \(\d{4}-\d{2}-\d{2}\))?\s*$/gm;

/**
 * Canonical form of a decision id: `D-003` for the legacy numbered form, `D-<date>-<slug>`
 * (lower case) for one-file decisions.
 *
 * @param {string} id
 * @returns {string}
 */
function normalizeDecisionId(id) {
  const text = String(id || '').trim();
  if (/^d-\d+$/i.test(text)) return text.toUpperCase();
  return text ? `D-${text.replace(/^d-/i, '').toLowerCase()}` : '';
}

/**
 * @param {string} date - YYYY-MM-DD
 * @param {string} title
 * @returns {{ id: string, rel: string }}
 */
function getDecisionPath(date, title) {
  const name = `${date}-${toSlug(title).slice(0, 60)}`;
  return { id: `D-${name}`, rel: `${DECISIONS_DIR}/${name}.md` };
}

/**
 * The `- Decision:` line of a record, without its label ('' when missing or empty).
 *
 * @param {string[]} body
 * @returns {string}
 */
function readDecisionLine(body) {
  const line = body.map(l => l.trim()).find(l => /^- Decision:\s*\S/.test(l));
  return line ? line.replace(/^- Decision:\s*/, '') : '';
}

/**
 * Every decision record, newest first: one-file decisions (by file name, which starts
 * with the date), then the legacy entries of DECISIONS.md in their written order.
 * Template placeholders ("TODO title") are left out.
 *
 * @param {string} root - Project root directory
 * @returns {Array<{ id: string, title: string, decision: string, supersedes: string, rel: string }>}
 */
function listDecisions(root) {
  const records = [];
  const dir = path.join(root, DECISIONS_DIR);
  let names = [];
  try {
    names = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.md') && !n.startsWith('_')) : [];
  } catch {
    // An unreadable folder holds no decisions we can show
  }
  for (const name of names.sort().reverse()) {
    const rel = `${DECISIONS_DIR}/${name}`;
    const text = read(path.join(root, rel)) || '';
    const fm = parseFrontmatter(text);
    const lines = stripFrontmatter(text).split('\n');
    const heading = lines.find(l => /^# \S/.test(l));
    records.push({
      id: normalizeDecisionId(fm.id || `D-${name.slice(0, -3)}`),
      title: heading ? heading.slice(2).trim() : name.slice(0, -3),
      decision: readDecisionLine(lines),
      supersedes: normalizeDecisionId(fm.supersedes),
      rel
    });
  }

  const legacy = stripFrontmatter(read(path.join(root, LEGACY_DECISIONS_DOC)) || '');
  for (const entry of legacy.split(/^(?=## D-\d+ )/m)) {
    const [heading, ...body] = entry.split('\n');
    const match = [...`${heading}\n`.matchAll(LEGACY_HEADING)][0];
    if (!match || /^TODO\b/.test(match[3])) continue;
    const supersedes = body.map(l => l.trim()).find(l => /^- Supersedes:\s*\S/.test(l));
    records.push({
      id: match[1],
      title: match[3].trim(),
      decision: readDecisionLine(body),
      supersedes: supersedes ? normalizeDecisionId(supersedes.replace(/^- Supersedes:\s*/, '')) : '',
      rel: LEGACY_DECISIONS_DOC
    });
  }
  return records;
}

module.exports = {
  DECISIONS_DIR,
  LEGACY_DECISIONS_DOC,
  normalizeDecisionId,
  getDecisionPath,
  listDecisions
};
