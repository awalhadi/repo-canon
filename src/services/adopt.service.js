'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exists, read, write } = require('../core/fs');
const { parseFrontmatter, stripFrontmatter } = require('../core/frontmatter');
const { estimateTokens } = require('../core/tokens');
const { getUncommittedPaths } = require('../core/git');
const { BLOCK_START, BLOCK_END, upsertManagedBlock } = require('../core/blocks');
const { getTarget } = require('../core/targets');
const { findInferableContent } = require('./inferable.service');
const { findSecrets } = require('./secrets.service');
const { GENERATED_MARKER } = require('./rules.service');
const { initProject } = require('./init.service');

const MARKER_PREFIX = '<!-- repocanon:adopted';

/**
 * Single-file instruction formats and the RepoCanon target that replaces them.
 * `target: null` = the file is retired entirely on --move.
 */
const SINGLE_FILES = [
  { rel: 'CLAUDE.md', target: 'claude' },
  { rel: 'GEMINI.md', target: 'gemini' },
  { rel: '.windsurfrules', target: 'windsurf' },
  { rel: '.clinerules', target: 'cline' },
  { rel: '.github/copilot-instructions.md', target: 'copilot' },
  { rel: '.cursorrules', target: null }
];

/**
 * Cline memory-bank files map straight to a doc (names from Cline's docs).
 */
const MEMORY_BANK_DOCS = {
  projectbrief: 'PROJECT',
  productcontext: 'PROJECT',
  techcontext: 'PROJECT',
  systempatterns: 'CONVENTIONS',
  activecontext: 'STATE',
  progress: 'STATE'
};

/**
 * Heading keywords → destination doc, checked in order; CONVENTIONS is the default.
 */
const HEADING_ROUTES = [
  ['DOMAIN', /\b(glossary|domain|business|invariants?|entit(y|ies)|states?|state machines?|permissions?|roles?|terms?)\b/],
  ['DECISIONS', /\b(decisions?|why|rationale|adrs?|trade-?offs?)\b/],
  ['STATE', /\b(progress|status|current|active|todos?|roadmap|known issues?|next steps?|in progress|recent)\b/],
  ['PROJECT', /\b(overview|about|purpose|product|architecture|environments?|deploy(ment)?|integrations?|services|external|brief)\b/]
];

/**
 * Removes RepoCanon's own managed block, leaving only what the user wrote.
 *
 * @param {string} text
 * @returns {string}
 */
function stripManagedBlock(text) {
  const start = text.indexOf(BLOCK_START);
  const end = text.indexOf(BLOCK_END, start);
  return start === -1 || end === -1 ? text : text.slice(0, start) + text.slice(end + BLOCK_END.length);
}

/**
 * @param {string} value - frontmatter value as the parser returns it (string, maybe quoted)
 * @returns {string}
 */
function unquote(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

/**
 * Where an imported section belongs.
 *
 * @param {string} sourceRel
 * @param {string} heading
 * @returns {string} core doc name
 */
function routeSection(sourceRel, heading) {
  if (sourceRel.startsWith('memory-bank/')) {
    const key = path.posix.basename(sourceRel, '.md').toLowerCase().replace(/[^a-z]/g, '');
    if (MEMORY_BANK_DOCS[key]) return MEMORY_BANK_DOCS[key];
  }
  const lower = heading.toLowerCase();
  const match = HEADING_ROUTES.find(([, re]) => re.test(lower));
  return match ? match[0] : 'CONVENTIONS';
}

/**
 * Finds agent-instruction files worth importing, and those deliberately left alone.
 *
 * @param {string} root
 * @returns {{ sources: Array<{ rel: string, text: string, target: string|null, retire: boolean }>,
 *             skipped: Array<{ rel: string, reason: string }> }}
 */
function findSources(root) {
  const sources = [];
  const skipped = [];
  const isFile = rel => {
    try {
      return fs.statSync(path.join(root, rel)).isFile();
    } catch {
      return false;
    }
  };
  const listMarkdown = (dir, ext) => {
    try {
      return fs.readdirSync(path.join(root, dir)).filter(n => n.endsWith(ext)).sort().map(n => `${dir}/${n}`);
    } catch {
      return [];
    }
  };
  const add = (rel, text, target, retire) => {
    const authored = text.trim();
    if (authored && !authored.includes(GENERATED_MARKER)) sources.push({ rel, text: authored, target, retire });
  };

  for (const { rel, target } of SINGLE_FILES) {
    if (isFile(rel)) add(rel, stripManagedBlock(read(path.join(root, rel)) || ''), target, target === null);
  }

  for (const rel of listMarkdown('.cursor/rules', '.mdc')) {
    const text = read(path.join(root, rel)) || '';
    if (rel === '.cursor/rules/project.mdc' || text.includes(GENERATED_MARKER)) continue;
    const fm = parseFrontmatter(text);
    if (unquote(fm.globs) && unquote(fm.alwaysApply) !== 'true') {
      skipped.push({ rel, reason: `already scoped to ${unquote(fm.globs)} (keeps working as is)` });
      continue;
    }
    add(rel, stripFrontmatter(stripManagedBlock(text)), null, true);
  }

  for (const rel of listMarkdown('.github/instructions', '.instructions.md')) {
    const text = read(path.join(root, rel)) || '';
    if (text.includes(GENERATED_MARKER)) continue;
    const applyTo = unquote(parseFrontmatter(text).applyTo);
    if (applyTo && applyTo !== '**' && applyTo !== '**/*') {
      skipped.push({ rel, reason: `already scoped to ${applyTo} (keeps working as is)` });
      continue;
    }
    add(rel, stripFrontmatter(text), null, true);
  }

  if (!isFile('.clinerules')) {
    for (const rel of listMarkdown('.clinerules', '.md')) add(rel, read(path.join(root, rel)) || '', null, true);
  }
  for (const rel of listMarkdown('memory-bank', '.md')) add(rel, read(path.join(root, rel)) || '', null, true);

  return { sources, skipped };
}

/**
 * Cleans one source (inferable spans and secret lines out) and splits it into routed sections.
 *
 * @param {{ rel: string, text: string }} source
 * @returns {{ sections: Array<{ doc: string, heading: string, body: string }>, inferableTokens: number, secretLines: number }}
 */
function prepareSource(source) {
  const lines = source.text.split('\n');
  const drop = new Set();
  let inferableTokens = 0;

  for (const finding of findInferableContent(source.text)) {
    for (let i = finding.line - 1; i < finding.endLine; i++) drop.add(i);
    inferableTokens += finding.tokens;
  }
  const secretLines = new Set(findSecrets(source.text).map(f => f.line - 1));
  secretLines.forEach(i => drop.add(i));

  const sections = [];
  let current = { heading: '', body: [] };
  const flush = () => {
    const body = current.body.join('\n').trim();
    if (body) sections.push({ doc: routeSection(source.rel, current.heading), heading: current.heading, body });
  };
  lines.forEach((line, index) => {
    if (drop.has(index)) return;
    const heading = line.match(/^#{1,2}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flush();
      current = { heading: heading[1], body: [] };
    } else {
      current.body.push(line);
    }
  });
  flush();

  return { sections, inferableTokens, secretLines: secretLines.size };
}

/**
 * Previews the import: per source, where its sections go and what was removed.
 *
 * @param {string} root - Project root directory
 * @returns {{ rows: Array<Record<string, any>>, skipped: Array<{ rel: string, reason: string }> }}
 */
function planAdopt(root) {
  const { sources, skipped } = findSources(root);
  const existing = ['PROJECT', 'DOMAIN', 'CONVENTIONS', 'DECISIONS', 'STATE']
    .map(doc => read(path.join(root, '.ai', `${doc}.md`)) || '')
    .join('\n');

  const rows = sources.map(source => {
    const hash = crypto.createHash('sha1').update(source.text).digest('hex').slice(0, 8);
    const prepared = prepareSource(source);
    const destinations = {};
    for (const section of prepared.sections) {
      destinations[section.doc] = (destinations[section.doc] || 0) + 1;
    }
    let status = 'import';
    if (existing.includes(`${MARKER_PREFIX} ${source.rel} ${hash}`)) status = 'already';
    else if (existing.includes(`${MARKER_PREFIX} ${source.rel} `)) status = 'changed';

    return {
      rel: source.rel,
      target: source.target,
      retire: source.retire,
      hash,
      status,
      tokens: estimateTokens(source.text),
      importedTokens: estimateTokens(prepared.sections.map(s => s.body).join('\n')),
      inferableTokens: prepared.inferableTokens,
      secretLines: prepared.secretLines,
      destinations,
      sections: prepared.sections
    };
  });

  return { rows, skipped };
}

/**
 * Writes the import into .ai/ docs and, with `move`, reduces originals to RepoCanon pointers.
 *
 * @param {string} root
 * @param {ReturnType<typeof planAdopt>} plan
 * @param {{ move?: boolean }} [options={}]
 * @returns {ReturnType<typeof planAdopt> & { moved: Array<{ rel: string, action: 'pointer'|'removed' }>, notMoved: Array<{ rel: string, reason: string }> }}
 */
function applyAdopt(root, plan, options = {}) {
  for (const row of plan.rows.filter(r => r.status !== 'already')) {
    const byDoc = new Map();
    for (const section of row.sections) {
      if (!byDoc.has(section.doc)) byDoc.set(section.doc, []);
      byDoc.get(section.doc).push(section.heading ? `### ${section.heading}\n${section.body}` : section.body);
    }
    for (const [doc, parts] of byDoc) {
      const docPath = path.join(root, '.ai', `${doc}.md`);
      const block = [
        `## Imported from ${row.rel}`,
        `${MARKER_PREFIX} ${row.rel} ${row.hash} — review: keep only what the code can't tell an agent -->`,
        ...parts
      ].join('\n\n');
      write(docPath, `${(read(docPath) || '').trimEnd()}\n\n${block}\n`);
    }
  }

  const moved = [];
  const notMoved = [];
  if (options.move) {
    for (const row of plan.rows) {
      if (getUncommittedPaths(root, [row.rel]).length) {
        notMoved.push({ rel: row.rel, reason: 'uncommitted changes — commit first, then run adopt --move' });
        continue;
      }
      const fullPath = path.join(root, row.rel);
      fs.unlinkSync(fullPath);
      if (row.retire) {
        moved.push({ rel: row.rel, action: 'removed' });
      } else {
        const target = getTarget(row.target);
        upsertManagedBlock(fullPath, target.text, target.prefix || '');
        moved.push({ rel: row.rel, action: 'pointer' });
      }
    }
  }

  return { ...plan, moved, notMoved };
}

/**
 * One-step adoption: creates the knowledge layer if needed, imports, optionally moves.
 *
 * @param {string} root
 * @param {{ dryRun?: boolean, move?: boolean }} [options={}]
 */
function adoptProject(root, options = {}) {
  const initialized = !exists(path.join(root, '.ai'));
  if (initialized && !options.dryRun) {
    initProject(root);
  }
  const plan = planAdopt(root);
  const result = options.dryRun ? { ...plan, moved: [], notMoved: [] } : applyAdopt(root, plan, { move: options.move });
  return { ...result, initialized: initialized && !options.dryRun };
}

module.exports = {
  adoptProject,
  planAdopt,
  applyAdopt,
  routeSection
};
