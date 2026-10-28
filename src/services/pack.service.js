'use strict';

const fs = require('fs');
const path = require('path');
const { read, isPathInside, listWorkspaceFiles } = require('../core/fs');
const { parseFrontmatter, stripFrontmatter } = require('../core/frontmatter');
const { estimateTokens, truncateToTokens } = require('../core/tokens');
const { loadConfig } = require('../core/config');
const { detectProject } = require('../core/detector');
const { detectModules } = require('../core/modules');
const { detectWorkspaces } = require('../core/workspaces');
const { getDocStatus } = require('./status.service');
const { getClaims } = require('./claims.service');

/**
 * Builds a unified map of modules, merging detected modules with existing doc definitions.
 *
 * @param {string} root - Project root directory
 * @returns {Array<{ slug: string, paths: string[], doc: string|null }>}
 */
function getModuleMap(root) {
  const files = listWorkspaceFiles(root);
  const config = loadConfig(root);
  const project = detectProject(root);
  const detected = detectModules(files, config, project.stacks, detectWorkspaces(root, files));

  const map = new Map(detected.map(m => [m.slug, { slug: m.slug, paths: m.paths, doc: null }]));
  const modulesDir = path.join(root, '.ai', 'modules');

  if (fs.existsSync(modulesDir)) {
    try {
      const moduleFiles = fs.readdirSync(modulesDir);
      for (const f of moduleFiles) {
        if (!f.endsWith('.md') || f.startsWith('_')) {
          continue;
        }
        const slug = f.slice(0, -3);
        const docText = read(path.join(modulesDir, f));
        const fm = parseFrontmatter(docText);
        const paths =
          Array.isArray(fm.code_paths) && fm.code_paths.length
            ? fm.code_paths
            : (map.get(slug) || { paths: [] }).paths;

        map.set(slug, {
          slug,
          paths,
          doc: `.ai/modules/${f}`
        });
      }
    } catch {
      // Ignore read error
    }
  }

  return [...map.values()];
}

/**
 * Task words that say what to do, not where — they matched almost every module.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'onto', 'when', 'what', 'how', 'why',
  'are', 'was', 'were', 'not', 'but', 'all', 'any', 'can', 'should', 'would', 'could', 'need', 'want',
  'please', 'fix', 'add', 'adds', 'added', 'update', 'change', 'make', 'use', 'using', 'new', 'bug',
  'issue', 'feature', 'code', 'file', 'files', 'some', 'there', 'their', 'have', 'has', 'also'
]);

const SCORE_SLUG = 5;
const SCORE_PATH = 3;
const SCORE_BODY_CAP = 3;
const SCORE_FILE_MATCH = 1000;

/**
 * One-line warning shown under a doc's heading when it may not match the code.
 * Fresh docs get no label, so they cost no extra tokens.
 *
 * @param {{ state: string, detail: string } | undefined} status
 * @returns {string}
 */
function getFreshnessLabel(status) {
  if (!status) return '';
  switch (status.state) {
    case 'stale':
      return `> ⚠ stale: ${status.detail} — where it disagrees with the code, trust the code.`;
    case 'broken':
      return `> ✗ broken: ${status.detail} — verify against the code before relying on it.`;
    case 'unverified':
      return '> ○ unverified: never checked against the code — treat it as a hint.';
    case 'unknown':
      return '> ? verified_at is not in git history — treat it as a hint.';
    default:
      return '';
  }
}

/**
 * Splits text into lowercase word tokens, breaking camelCase ("CommissionService" → commission, service).
 *
 * @param {string} text
 * @returns {string[]}
 */
function toWords(text) {
  return String(text || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Whole-token match: exact, simple plural, or prefix for words of 5+ chars.
 * "auth" must not hit "author"; "refund" should hit "refunds" / "refunded".
 *
 * @param {string} token
 * @param {string} word
 * @returns {boolean}
 */
function matchesWord(token, word) {
  return token === word || token === `${word}s` || token === `${word}es` ||
    (word.length >= 5 && token.startsWith(word));
}

/**
 * Relevance of a module to the query words: slug and code-path hits weigh most,
 * doc-body hits (real symbols a filled doc mentions) add up to a cap per word.
 *
 * @param {{ slug: string, paths: string[] }} mod
 * @param {string} docBody
 * @param {string[]} words
 * @returns {number}
 */
function scoreModule(mod, docBody, words) {
  const slugWords = toWords(mod.slug);
  const pathWords = mod.paths.flatMap(toWords);
  const bodyWords = toWords(docBody);
  let score = 0;

  for (const word of words) {
    const hit = token => matchesWord(token, word);
    if (slugWords.some(hit)) score += SCORE_SLUG;
    if (pathWords.some(hit)) score += SCORE_PATH;
    score += Math.min(SCORE_BODY_CAP, bodyWords.filter(hit).length);
  }
  return score;
}

/**
 * Assembles a budgeted, focused context pack for a task:
 * PROJECT → CONVENTIONS → DOMAIN → modules ranked by relevance → STATE, capped at maxTokens.
 * Rules come before modules so a large module set can't push them out; no single
 * section may take more than half the budget.
 *
 * @param {string} root - Project root directory
 * @param {{ query?: string, files?: string[], maxTokens?: number }} [options={}]
 * @returns {{
 *   text: string,
 *   tokens: number,
 *   included: Array<{ rel: string, tokens: number }>,
 *   skipped: string[],
 *   modules: string[],
 *   scores: Record<string, number>,
 *   freshness: Record<string, string>
 * }}
 */
function packContext(root, options = {}) {
  const { query = '', files = [], maxTokens = 4000 } = options;
  const mods = getModuleMap(root);
  const scores = new Map();

  // Match by target files — always ranked above query matches
  for (const file of files) {
    const normalizedFile = file.replace(/^\.\//, '');
    for (const mod of mods) {
      if (mod.paths.some(p => isPathInside(normalizedFile, p))) {
        scores.set(mod.slug, SCORE_FILE_MATCH);
      }
    }
  }

  // Match by query words against slug, code paths and (when it exists) the doc body,
  // since a filled-in doc mentions real symbols the directory-level code_paths do not.
  const searchWords = [...new Set(toWords(query))].filter(w => w.length >= 3 && !STOPWORDS.has(w));

  if (searchWords.length) {
    for (const mod of mods) {
      const docBody = mod.doc ? stripFrontmatter(read(path.join(root, mod.doc)) || '') : '';
      const score = scoreModule(mod, docBody, searchWords);
      if (score > 0) {
        scores.set(mod.slug, (scores.get(mod.slug) || 0) + score);
      }
    }
  }

  const ranked = mods
    .filter(mod => scores.has(mod.slug))
    .sort((a, b) => scores.get(b.slug) - scores.get(a.slug) || a.slug.localeCompare(b.slug));

  // Assemble document parts
  const parts = ['.ai/PROJECT.md', '.ai/CONVENTIONS.md', '.ai/DOMAIN.md'].map(rel => [
    rel,
    read(path.join(root, rel))
  ]);

  for (const mod of ranked) {
    if (mod.doc) {
      parts.push([mod.doc, read(path.join(root, mod.doc))]);
    } else {
      parts.push([
        `module:${mod.slug} (no doc yet)`,
        `Code paths: ${mod.paths.join(', ')}\nNo module doc exists — create .ai/modules/${mod.slug}.md when you work here.`
      ]);
    }
  }

  parts.push(['.ai/STATE.md', read(path.join(root, '.ai/STATE.md'))]);

  const statusByDoc = new Map(getDocStatus(root).map(row => [row.doc, row]));
  // Claims whose code changed or vanished are named on their doc, even when the doc as a whole looks fresh
  const claimLabels = new Map();
  for (const claim of getClaims(root).claims.filter(c => c.state === 'stale' || c.state === 'broken')) {
    const mark = claim.state === 'stale' ? '⚠' : '✗';
    claimLabels.set(claim.doc, [...(claimLabels.get(claim.doc) || []), `> ${mark} claim "${claim.text}" is ${claim.state}: ${claim.detail}`]);
  }
  const freshness = {};
  const truncationMarker = '\n…[truncated]\n';
  const markerTokens = estimateTokens(truncationMarker);
  const sectionCap = Math.floor(maxTokens / 2);
  const outputSections = [];
  const included = [];
  const skipped = [];
  let usedTokens = 0;

  for (const [relPath, rawContent] of parts) {
    if (rawContent == null) {
      continue;
    }
    const status = statusByDoc.get(relPath);
    const labels = [getFreshnessLabel(status), ...(claimLabels.get(relPath) || [])].filter(Boolean);
    let sectionText = `## ${relPath}\n${labels.map(l => `${l}\n`).join('')}${stripFrontmatter(rawContent).trim()}\n`;
    let tokens = estimateTokens(sectionText);
    const allowance = Math.min(sectionCap, maxTokens - usedTokens);

    if (tokens > allowance) {
      if (allowance <= 300) {
        skipped.push(relPath);
        continue;
      }
      sectionText = `${truncateToTokens(sectionText, allowance - markerTokens)}${truncationMarker}`;
      tokens = estimateTokens(sectionText);
    }

    outputSections.push(sectionText);
    included.push({ rel: relPath, tokens });
    if (status) {
      freshness[relPath] = status.state;
    }
    usedTokens += tokens;
  }

  return {
    text: outputSections.join('\n'),
    tokens: usedTokens,
    included,
    skipped,
    modules: ranked.map(mod => mod.slug),
    scores: Object.fromEntries(ranked.map(mod => [mod.slug, scores.get(mod.slug)])),
    freshness
  };
}

module.exports = {
  getFreshnessLabel,
  getModuleMap,
  moduleMap: getModuleMap,
  packContext,
  pack: packContext
};
