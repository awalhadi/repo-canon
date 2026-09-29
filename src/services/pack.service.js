'use strict';

const fs = require('fs');
const path = require('path');
const { read, isPathInside, listWorkspaceFiles } = require('../core/fs');
const { parseFrontmatter, stripFrontmatter } = require('../core/frontmatter');
const { estimateTokens } = require('../core/tokens');
const { loadConfig } = require('../core/config');
const { detectProject } = require('../core/detector');
const { detectModules } = require('../core/modules');

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
  const detected = detectModules(files, config, project.stacks);

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
 * Assembles a budgeted, focused context pack for a task:
 * PROJECT.md + matched module docs + DOMAIN / CONVENTIONS / STATE.md, capped at maxTokens.
 *
 * @param {string} root - Project root directory
 * @param {{ query?: string, files?: string[], maxTokens?: number }} [options={}]
 * @returns {{
 *   text: string,
 *   tokens: number,
 *   included: Array<{ rel: string, tokens: number }>,
 *   skipped: string[],
 *   modules: string[]
 * }}
 */
function packContext(root, options = {}) {
  const { query = '', files = [], maxTokens = 4000 } = options;
  const mods = getModuleMap(root);
  const chosen = new Map();

  // Match by target files
  for (const file of files) {
    const normalizedFile = file.replace(/^\.\//, '');
    for (const mod of mods) {
      if (mod.paths.some(p => isPathInside(normalizedFile, p))) {
        chosen.set(mod.slug, mod);
      }
    }
  }

  // Match by search query terms — searched against the module's slug, code paths,
  // AND (when it exists) its doc body, since a filled-in doc mentions real symbols
  // (e.g. "CommissionService") that the directory-level code_paths do not contain.
  const searchWords = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3);

  if (searchWords.length) {
    for (const mod of mods) {
      const docBody = mod.doc ? stripFrontmatter(read(path.join(root, mod.doc)) || '') : '';
      const haystack = `${mod.slug} ${mod.paths.join(' ')} ${docBody}`.toLowerCase();
      if (searchWords.some(word => haystack.includes(word))) {
        chosen.set(mod.slug, mod);
      }
    }
  }

  // Assemble document parts
  const parts = [['.ai/PROJECT.md', read(path.join(root, '.ai/PROJECT.md'))]];

  for (const mod of chosen.values()) {
    if (mod.doc) {
      parts.push([mod.doc, read(path.join(root, mod.doc))]);
    } else {
      parts.push([
        `module:${mod.slug} (no doc yet)`,
        `Code paths: ${mod.paths.join(', ')}\nNo module doc exists — create .ai/modules/${mod.slug}.md when you work here.`
      ]);
    }
  }

  for (const rel of ['.ai/DOMAIN.md', '.ai/CONVENTIONS.md', '.ai/STATE.md']) {
    parts.push([rel, read(path.join(root, rel))]);
  }

  const outputSections = [];
  const included = [];
  const skipped = [];
  let usedTokens = 0;

  for (const [relPath, rawContent] of parts) {
    if (rawContent == null) {
      continue;
    }
    let sectionText = `## ${relPath}\n${stripFrontmatter(rawContent).trim()}\n`;
    let tokens = estimateTokens(sectionText);

    if (usedTokens + tokens > maxTokens) {
      const remainingTokens = maxTokens - usedTokens;
      if (remainingTokens > 300) {
        sectionText = `${sectionText.slice(0, remainingTokens * 4)}\n…[truncated]\n`;
        tokens = remainingTokens;
      } else {
        skipped.push(relPath);
        continue;
      }
    }

    outputSections.push(sectionText);
    included.push({ rel: relPath, tokens });
    usedTokens += tokens;
  }

  return {
    text: outputSections.join('\n'),
    tokens: usedTokens,
    included,
    skipped,
    modules: [...chosen.keys()]
  };
}

module.exports = {
  getModuleMap,
  moduleMap: getModuleMap,
  packContext,
  pack: packContext
};
