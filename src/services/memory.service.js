'use strict';

const path = require('path');
const { read, write, renderTemplate } = require('../core/fs');
const { DOC_LINE_CAPS } = require('../core/constants');
const { findSecrets, formatSecretFinding } = require('./secrets.service');
const { findInferableContent, INFERABLE_LABELS } = require('./inferable.service');
const { getDocStatus, matchesDocName } = require('./status.service');
const { runDoctor } = require('./doctor.service');
const { formatScore } = require('./score.service');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');
const DECISIONS_DOC = '.ai/DECISIONS.md';
const STATE_DOC = '.ai/STATE.md';
const MAX_RECENT_CHANGES = 10;
const MAX_LIST_ITEMS = 8;
const LIMITS = { title: 80, decision: 300, why: 300, revisit: 300, focus: 200, item: 200, change: 200 };

const getCap = rel => (DOC_LINE_CAPS.find(([doc]) => doc === rel) || [null, Infinity])[1];
const today = now => (now || new Date()).toISOString().slice(0, 10);

/**
 * Checks one field an agent wants written: a single line within its length limit.
 *
 * @param {string} name
 * @param {any} value
 * @param {number} limit
 * @param {string[]} problems - collects what is wrong
 * @returns {string} the trimmed value
 */
function checkField(name, value, limit, problems) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    problems.push(`${name} is empty`);
  } else if (/[\r\n]/.test(text)) {
    problems.push(`${name} must be one line — keep entries short; details belong in the code or the PR`);
  } else if (text.length > limit) {
    problems.push(`${name} is ${text.length} characters (max ${limit}) — say it shorter`);
  }
  return text;
}

/**
 * What blocks a write to the knowledge layer: secrets, and content agents can read from
 * the code (trees, code dumps, dependency lists) that would cost tokens on every task.
 *
 * @param {string} text - the text about to be written
 * @param {{ allowCatalogue?: boolean }} [options={}]
 * @returns {{ ok: boolean, problems: string[] }}
 */
function guardContent(text, options = {}) {
  const problems = [
    ...findSecrets(text).map(item => formatSecretFinding('input', item)),
    ...findInferableContent(text, options).map(item => `${INFERABLE_LABELS[item.kind]} — ${item.hint}`)
  ];
  return { ok: !problems.length, problems };
}

/**
 * Reads a core doc, or renders its template when it does not exist yet. A new doc
 * gets an empty verified_at: writing it is not verifying it.
 *
 * @param {string} root
 * @param {string} rel
 * @param {Date} [now]
 * @returns {string}
 */
function readOrTemplate(root, rel, now) {
  const existing = read(path.join(root, rel));
  if (existing !== null) return existing;
  const template = read(path.join(TEMPLATES_DIR, path.basename(rel))) || '';
  return renderTemplate(template, { head: '', date: today(now) });
}

/**
 * Adds a numbered decision record to .ai/DECISIONS.md, newest on top.
 *
 * @param {string} root - Project root directory
 * @param {{ title?: string, decision?: string, why?: string, revisit?: string, supersedes?: string, now?: Date }} input
 * @returns {{ ok: true, id: string, file: string, warnings: string[] } | { ok: false, problems: string[] }}
 */
function proposeAdr(root, input = {}) {
  const problems = [];
  const title = checkField('title', input.title, LIMITS.title, problems);
  const decision = checkField('decision', input.decision, LIMITS.decision, problems);
  const why = checkField('why', input.why, LIMITS.why, problems);
  const revisit = input.revisit ? checkField('revisit', input.revisit, LIMITS.revisit, problems) : '';

  const text = readOrTemplate(root, DECISIONS_DOC, input.now);
  const headings = [...text.matchAll(/^## (D-(\d+)) (.*?)(?: \(\d{4}-\d{2}-\d{2}\))?\s*$/gm)];
  const isPlaceholder = h => /^TODO\b/.test(h[3]);
  const real = headings.filter(h => !isPlaceholder(h));

  const supersedes = input.supersedes ? String(input.supersedes).trim().toUpperCase() : '';
  if (supersedes && !real.some(h => h[1] === supersedes)) {
    problems.push(`supersedes: no decision ${supersedes} in ${DECISIONS_DOC}`);
  }
  if (title && real.some(h => h[3].trim().toLowerCase() === title.toLowerCase())) {
    problems.push(`a decision titled "${title}" already exists — update it instead of adding a duplicate`);
  }
  if (problems.length) return { ok: false, problems };

  const next = real.reduce((max, h) => Math.max(max, Number(h[2])), 0) + 1;
  const id = `D-${String(next).padStart(3, '0')}`;
  const entry = [
    `## ${id} ${title} (${today(input.now)})`,
    `- Decision: ${decision}`,
    `- Why: ${why}`,
    `- Revisit if: ${revisit}`.trimEnd(),
    ...(supersedes ? [`- Supersedes: ${supersedes}`] : [])
  ];

  const guard = guardContent(entry.join('\n'));
  if (!guard.ok) return { ok: false, problems: guard.problems };

  // The template's untouched "D-001 TODO title" stub is replaced, never kept below a real entry
  let lines = text.split('\n');
  const stub = headings.find(isPlaceholder);
  if (stub) {
    const start = lines.findIndex(l => l.startsWith(`## ${stub[1]} `));
    let end = start + 1;
    while (end < lines.length && !lines[end].startsWith('## ')) end++;
    lines = [...lines.slice(0, start), ...lines.slice(end)];
  }

  const first = lines.findIndex(l => /^## D-\d+/.test(l));
  if (first === -1) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', ...entry, '');
  } else {
    lines.splice(first, 0, ...entry, '');
  }

  const updated = lines.join('\n');
  write(path.join(root, DECISIONS_DOC), updated);
  const cap = getCap(DECISIONS_DOC);
  const lineCount = updated.split('\n').length;
  const warnings = lineCount > cap
    ? [`${DECISIONS_DOC} is ${lineCount} lines (cap ${cap}) — move superseded decisions out`]
    : [];
  return { ok: true, id, file: DECISIONS_DOC, warnings };
}

/**
 * Replaces the body of the `## <name…>` section (heading matched by prefix), or
 * appends the section when the doc has none.
 *
 * @param {string[]} lines
 * @param {string} name
 * @param {string[]} body
 * @returns {string[]}
 */
function replaceSection(lines, name, body) {
  const start = lines.findIndex(l => l.toLowerCase().startsWith(`## ${name.toLowerCase()}`));
  if (start === -1) {
    const out = [...lines];
    while (out.length && !out[out.length - 1].trim()) out.pop();
    return [...out, '', `## ${name}`, ...body, ''];
  }
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('## ')) end++;
  return [...lines.slice(0, start + 1), ...body, '', ...lines.slice(end)];
}

/**
 * Bullet lines of a section (empty when the section is missing).
 *
 * @param {string[]} lines
 * @param {string} name
 * @returns {string[]}
 */
function readSectionBullets(lines, name) {
  const start = lines.findIndex(l => l.toLowerCase().startsWith(`## ${name.toLowerCase()}`));
  if (start === -1) return [];
  const bullets = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    if (lines[i].startsWith('- ')) bullets.push(lines[i]);
  }
  return bullets;
}

/**
 * Records where work stands in .ai/STATE.md. Only the given sections change, and
 * verified_at is never touched: a checkpoint says what happened, not that docs match code.
 *
 * @param {string} root - Project root directory
 * @param {{ focus?: string, in_progress?: string[], known_issues?: string[], change?: string, now?: Date }} input
 * @returns {{ ok: true, file: string, sections: string[] } | { ok: false, problems: string[] }}
 */
function checkpointState(root, input = {}) {
  const problems = [];
  const sections = [];
  const has = key => input[key] !== undefined && input[key] !== null;

  const checkList = key => {
    if (!Array.isArray(input[key])) {
      problems.push(`${key} must be a list of short items`);
      return [];
    }
    if (input[key].length > MAX_LIST_ITEMS) {
      problems.push(`${key} has ${input[key].length} items (max ${MAX_LIST_ITEMS}) — keep the top ones`);
    }
    return input[key].map((item, i) => checkField(`${key}[${i}]`, item, LIMITS.item, problems));
  };

  const focus = has('focus') ? checkField('focus', input.focus, LIMITS.focus, problems) : null;
  const inProgress = has('in_progress') ? checkList('in_progress') : null;
  const knownIssues = has('known_issues') ? checkList('known_issues') : null;
  const change = has('change') ? checkField('change', input.change, LIMITS.change, problems) : null;

  if (focus === null && inProgress === null && knownIssues === null && change === null) {
    problems.push('nothing to record — give focus, in_progress, known_issues or change');
  }
  if (problems.length) return { ok: false, problems };

  const toBullets = items => (items.length ? items.map(item => `- ${item}`) : ['- none']);
  let lines = readOrTemplate(root, STATE_DOC, input.now).split('\n');
  const written = [];

  if (focus !== null) {
    lines = replaceSection(lines, 'Current focus', [`- ${focus}`]);
    sections.push('Current focus');
    written.push(focus);
  }
  if (inProgress !== null) {
    lines = replaceSection(lines, 'In progress', toBullets(inProgress));
    sections.push('In progress');
    written.push(...inProgress);
  }
  if (knownIssues !== null) {
    lines = replaceSection(lines, 'Known issues', toBullets(knownIssues));
    sections.push('Known issues');
    written.push(...knownIssues);
  }
  if (change !== null) {
    const recent = [`- ${today(input.now)}: ${change}`, ...readSectionBullets(lines, 'Recent significant changes')]
      .slice(0, MAX_RECENT_CHANGES);
    lines = replaceSection(lines, 'Recent significant changes', recent);
    sections.push('Recent significant changes');
    written.push(change);
  }

  const guard = guardContent(written.map(item => `- ${item}`).join('\n'));
  if (!guard.ok) return { ok: false, problems: guard.problems };

  lines = lines.map(l => (/^Updated: /.test(l) ? `Updated: ${today(input.now)}` : l));
  const updated = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  const cap = getCap(STATE_DOC);
  const lineCount = updated.split('\n').length;
  if (lineCount > cap) {
    return { ok: false, problems: [`${STATE_DOC} would be ${lineCount} lines (cap ${cap}) — record less; older history lives in git`] };
  }

  write(path.join(root, STATE_DOC), updated);
  return { ok: true, file: STATE_DOC, sections };
}

/**
 * The "am I done?" check for an agent: doctor errors and warnings plus stale or broken
 * docs, narrowed to the named docs when given. Errors and stale/broken docs fail it;
 * warnings are listed but pass.
 *
 * @param {string} root - Project root directory
 * @param {{ docs?: string[] }} [options={}]
 * @returns {{ pass: boolean, errors: string[], warnings: string[], stale: string[], score: string }}
 */
function verifyKnowledge(root, options = {}) {
  const names = Array.isArray(options.docs) ? options.docs.filter(Boolean) : [];
  const inScope = file => !names.length || (file && names.some(name => matchesDocName(file, name)));

  const report = runDoctor(root);
  const errors = report.findings.filter(f => f.level === 'error' && (inScope(f.file) || !f.file)).map(f => f.msg);
  const warnings = report.findings.filter(f => f.level === 'warn' && inScope(f.file)).map(f => f.msg);
  const stale = getDocStatus(root)
    .filter(row => (row.state === 'stale' || row.state === 'broken') && inScope(row.doc))
    .map(row => `${row.doc} is ${row.state}: ${row.detail}`);

  return {
    pass: !errors.length && !stale.length,
    errors,
    warnings,
    stale,
    score: report.score ? formatScore(report.score) : ''
  };
}

module.exports = {
  guardContent,
  proposeAdr,
  checkpointState,
  verifyKnowledge
};
