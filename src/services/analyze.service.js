'use strict';

const path = require('path');
const { exists, read, write, listWorkspaceFiles } = require('../core/fs');
const { loadConfig } = require('../core/config');
const { detectProject } = require('../core/detector');
const { detectModules } = require('../core/modules');

const AUTO_BLOCK_START = '<!-- cf:auto:start -->';
const AUTO_BLOCK_END = '<!-- cf:auto:end -->';
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

/**
 * Builds an overview of repository files, top-level directories, and detected modules.
 *
 * @param {string} root - Project root directory
 * @returns {{
 *   cfg: ReturnType<typeof loadConfig>,
 *   files: string[],
 *   d: ReturnType<typeof detectProject>,
 *   mods: Array<any>,
 *   top: Record<string, number>
 * }}
 */
function getProjectOverview(root) {
  const config = loadConfig(root);
  const files = listWorkspaceFiles(root);
  const project = detectProject(root);

  const modules = detectModules(files, config, project.stacks).map(mod => {
    const docPath = `.ai/modules/${mod.slug}.md`;
    return {
      ...mod,
      doc: docPath,
      has: exists(path.join(root, docPath))
    };
  });

  const topLevelCounts = {};
  for (const file of files) {
    const topKey = file.includes('/') ? file.split('/')[0] : '(root files)';
    topLevelCounts[topKey] = (topLevelCounts[topKey] || 0) + 1;
  }

  return {
    cfg: config,
    files,
    d: project,
    mods: modules,
    top: topLevelCounts
  };
}

/**
 * Updates .ai/INDEX.md with the automated module and directory map,
 * optionally scaffolding missing module markdown documents.
 *
 * @param {string} root - Project root directory
 * @param {{ scaffold?: boolean }} [options={}] - Analysis options
 * @returns {{ modules: Array<any>, scaffolded: string[], config: boolean }}
 */
function analyzeProject(root, options = {}) {
  const { cfg, mods, top } = getProjectOverview(root);

  const autoBlockContent = [
    AUTO_BLOCK_START,
    '## Top-level map (auto)',
    '',
    '| path | files | purpose |',
    '|---|---|---|',
    ...Object.entries(top)
      .sort()
      .map(([dir, count]) => `| ${dir}${dir.startsWith('(') ? '' : '/'} | ${count} | TODO |`),
    '',
    '## Modules (auto)',
    '',
    '| module | code paths | files | doc |',
    '|---|---|---|---|',
    ...mods.map(
      mod => `| ${mod.slug} | ${mod.paths.join(', ')} | ${mod.files} | ${mod.has ? mod.doc : '— (create when working here)'} |`
    ),
    AUTO_BLOCK_END
  ].join('\n');

  const indexPath = path.join(root, '.ai/INDEX.md');
  let currentIndex = read(indexPath) || '---\nverified_at: \n---\n# Index\n';

  if (currentIndex.includes(AUTO_BLOCK_START)) {
    currentIndex = currentIndex.replace(
      new RegExp(`${AUTO_BLOCK_START}[\\s\\S]*?${AUTO_BLOCK_END}`),
      () => autoBlockContent
    );
  } else {
    currentIndex = `${currentIndex.trimEnd()}\n\n${autoBlockContent}\n`;
  }

  write(indexPath, currentIndex);

  const scaffolded = [];
  if (options.scaffold) {
    const templatePath = path.join(TEMPLATES_DIR, 'module.md');
    const moduleTemplate = read(templatePath) || '';

    for (const mod of mods) {
      if (!mod.has) {
        const fullDocPath = path.join(root, mod.doc);
        const docContent = moduleTemplate
          .replace('module: <name>', `module: ${mod.slug}`)
          .replace('# <Name>', `# ${mod.slug}`)
          .replace('code_paths: []', `code_paths: [${mod.paths.join(', ')}]`);

        write(fullDocPath, docContent);
        scaffolded.push(mod.doc);
      }
    }
  }

  return {
    modules: mods,
    scaffolded,
    config: cfg._found
  };
}

module.exports = {
  getProjectOverview,
  overview: getProjectOverview,
  analyzeProject,
  analyze: analyzeProject
};
