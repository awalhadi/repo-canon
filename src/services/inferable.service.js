'use strict';

const path = require('path');
const { read } = require('../core/fs');
const { estimateTokens } = require('../core/tokens');
const { BLOCK_START, BLOCK_END } = require('../core/blocks');
const { AUTO_BLOCK_START, AUTO_BLOCK_END } = require('./analyze.service');
const { getKnowledgeDocs } = require('./status.service');

/**
 * Fence languages that mean "pasted source code". Shell, config, diagrams and
 * plain text are fine in docs (commands, config keys, mermaid).
 */
const CODE_LANGS = new Set([
  'js', 'jsx', 'javascript', 'ts', 'tsx', 'typescript', 'mjs', 'cjs', 'php', 'py', 'python',
  'go', 'golang', 'rb', 'ruby', 'java', 'kt', 'kotlin', 'rs', 'rust', 'cs', 'csharp', 'c', 'cpp',
  'swift', 'dart', 'scala', 'vue', 'svelte', 'sql', 'html', 'css', 'scss', 'blade', 'erb'
]);

const TREE_LINE = /[├└]──|│\s/;
// A package name at the start of a bullet/row/line, then its version — not prose like "Released v0.5.0"
const DEP_LINE = /^\s*(?:[-*+]|\|)?\s*[`"']?@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?[`"']?\s*(?:@|:\s*[`"']?|\|\s*[`"']?|\s+v?)[\^~>=<]*\d+\.\d+/i;
// A bullet/row that is just `some/file.ext — description` (extension starts with a letter, so `vue@3.4.1` isn't a file)
const CATALOGUE_LINE = /^\s*(?:[-*]|\|)\s*`?[\w.@/-]+\.[a-z][a-z0-9]{0,4}`?\s*(?:[:|—–-]|$)/i;

const MIN_TREE_LINES = 3;
const MIN_CODE_LINES = 3;
const MIN_DEP_LINES = 4;
const MIN_CATALOGUE_LINES = 12;

const HINTS = {
  tree: 'agents can list folders; keep only ownership that is not obvious',
  code: 'point to it as `path:symbol` instead',
  deps: 'it is already in the manifest',
  catalogue: 'keep only files whose role is not obvious from their name'
};

const LABELS = {
  tree: 'directory tree',
  code: 'pasted source code',
  deps: 'dependency list',
  catalogue: 'file catalogue'
};

/**
 * Blanks out generated blocks (RepoCanon managed blocks, INDEX auto map) while
 * keeping line numbers, so findings point at the user's own lines.
 *
 * @param {string} text
 * @returns {string[]}
 */
function getAuthoredLines(text) {
  const lines = String(text || '').split('\n');
  const ranges = [[BLOCK_START, BLOCK_END], [AUTO_BLOCK_START, AUTO_BLOCK_END]];
  let closing = null;

  return lines.map(line => {
    if (closing) {
      if (line.includes(closing)) closing = null;
      return '';
    }
    const range = ranges.find(([start]) => line.includes(start));
    if (range) {
      closing = line.includes(range[1]) ? null : range[1];
      return '';
    }
    return line;
  });
}

/**
 * Groups consecutive line indexes into runs, allowing `gap` non-matching lines inside a run.
 *
 * @param {number[]} indexes - sorted line indexes
 * @param {number} gap
 * @returns {number[][]}
 */
function toRuns(indexes, gap) {
  const runs = [];
  for (const index of indexes) {
    const last = runs.at(-1);
    if (last && index - last.at(-1) <= gap + 1) {
      last.push(index);
    } else {
      runs.push([index]);
    }
  }
  return runs;
}

/**
 * Finds content an agent can learn by reading the code itself — the kind of text
 * that costs tokens on every task without making the agent more correct.
 *
 * @param {string} text - document text
 * @param {{ allowCatalogue?: boolean }} [options={}] - allowCatalogue: true for module docs
 *   and INDEX.md, whose code maps are supposed to list files
 * @returns {Array<{ line: number, kind: 'tree'|'code'|'deps'|'catalogue', tokens: number, hint: string }>}
 */
function findInferableContent(text, options = {}) {
  const lines = getAuthoredLines(text);
  const findings = [];
  const flagged = new Set();

  const addFinding = (kind, start, end) => {
    const span = lines.slice(start, end + 1).join('\n');
    for (let i = start; i <= end; i++) flagged.add(i);
    findings.push({ line: start + 1, kind, tokens: estimateTokens(span), hint: HINTS[kind] });
  };

  // Fenced code blocks: source-language fences are code copies; any fence drawing a tree is a tree
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^\s*(`{3,}|~{3,})\s*([\w+#-]*)/);
    if (!open) continue;
    const fence = open[1];
    let end = i + 1;
    while (end < lines.length && !lines[end].trim().startsWith(fence)) end++;
    const body = lines.slice(i + 1, end);
    const lang = open[2].toLowerCase();

    if (body.filter(l => TREE_LINE.test(l)).length >= MIN_TREE_LINES) {
      addFinding('tree', i, Math.min(end, lines.length - 1));
    } else if (CODE_LANGS.has(lang) && body.filter(l => l.trim()).length >= MIN_CODE_LINES) {
      addFinding('code', i, Math.min(end, lines.length - 1));
    } else {
      for (let j = i; j <= Math.min(end, lines.length - 1); j++) flagged.add(j);
    }
    i = end;
  }

  // Trees drawn outside a fence
  const treeLines = lines.map((l, i) => (!flagged.has(i) && TREE_LINE.test(l) ? i : -1)).filter(i => i >= 0);
  for (const run of toRuns(treeLines, 0)) {
    if (run.length >= MIN_TREE_LINES) addFinding('tree', run[0], run.at(-1));
  }

  const depLines = lines.map((l, i) => (!flagged.has(i) && DEP_LINE.test(l) ? i : -1)).filter(i => i >= 0);
  for (const run of toRuns(depLines, 1)) {
    if (run.length >= MIN_DEP_LINES) addFinding('deps', run[0], run.at(-1));
  }

  if (!options.allowCatalogue) {
    const catalogueLines = lines
      .map((l, i) => (!flagged.has(i) && CATALOGUE_LINE.test(l) ? i : -1))
      .filter(i => i >= 0);
    for (const run of toRuns(catalogueLines, 2)) {
      if (run.length >= MIN_CATALOGUE_LINES) addFinding('catalogue', run[0], run.at(-1));
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

/**
 * Runs findInferableContent over AGENTS.md and every .ai/ doc.
 *
 * @param {string} root - Project root directory
 * @returns {Array<{ doc: string, findings: ReturnType<typeof findInferableContent> }>} docs with findings only
 */
function scanKnowledgeLayer(root) {
  const docs = [];
  const agentsText = read(path.join(root, 'AGENTS.md'));
  if (agentsText !== null) {
    docs.push({ rel: 'AGENTS.md', text: agentsText });
  }
  docs.push(...getKnowledgeDocs(root));

  return docs
    .map(doc => ({
      doc: doc.rel,
      findings: findInferableContent(doc.text, {
        allowCatalogue: doc.rel.includes('/modules/') || doc.rel.endsWith('INDEX.md')
      })
    }))
    .filter(entry => entry.findings.length);
}

module.exports = {
  findInferableContent,
  scanKnowledgeLayer,
  INFERABLE_LABELS: LABELS
};
