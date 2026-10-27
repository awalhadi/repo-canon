'use strict';

const path = require('path');
const { exists, read, write, renderTemplate } = require('../core/fs');
const { getHeadShort } = require('../core/git');
const { upsertManagedBlock } = require('../core/blocks');
const { detectProject } = require('../core/detector');
const { CORE_DOCS } = require('../core/constants');
const { resolveDefaultTargets, planTargets, applyTargets } = require('./targets.service');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

/**
 * Initializes the RepoCanon knowledge layer (.ai/) in a project, then points the
 * selected AI tools at AGENTS.md. Safe to re-run: core docs are kept unless `force`,
 * managed blocks are only rewritten when they differ, and deselected tools keep
 * their block unless `prune`.
 *
 * @param {string} root - Project root directory
 * @param {{ force?: boolean, targets?: string[], prune?: boolean }} [options={}]
 *   `targets` omitted → the saved choice, else the tools the project already uses.
 * @returns {{
 *   log: Array<[string, string]>,
 *   detected: ReturnType<typeof detectProject>,
 *   targets: { ids: string[], source: string, config: { status: string, error?: string } }
 * }}
 */
function initProject(root, options = {}) {
  const detected = detectProject(root);
  const selection = options.targets
    ? { ids: options.targets, source: 'explicit' }
    : resolveDefaultTargets(root);
  const currentHead = getHeadShort(root) || '';
  const currentDate = new Date().toISOString().slice(0, 10);

  const templateVars = {
    name: detected.name,
    stack: detected.stacks.join(', ') || 'TODO',
    run: detected.run,
    test: detected.test,
    lint: detected.lint,
    head: currentHead,
    date: currentDate
  };

  const log = [];

  const putFile = (relPath, content) => {
    const fullPath = path.join(root, relPath);
    if (exists(fullPath) && !options.force) {
      log.push(['kept', relPath]);
      return;
    }
    write(fullPath, content);
    log.push(['created', relPath]);
  };

  const putManagedBlock = (relPath, body) => {
    const status = upsertManagedBlock(path.join(root, relPath), body);
    log.push([status, relPath]);
  };

  // Base configurations and ignore files
  const templateConfig = read(path.join(TEMPLATES_DIR, 'repocanon.json'));
  putFile('.repocanon.json', templateConfig);
  putFile('.ai/.gitignore', '.sync-report.md\n');

  // Core .ai documentation files
  for (const docName of CORE_DOCS) {
    const templateContent = read(path.join(TEMPLATES_DIR, `${docName}.md`));
    putFile(`.ai/${docName}.md`, renderTemplate(templateContent, templateVars));
  }

  // Pre-configured prompts
  putFile('.ai/prompts/update.md', read(path.join(TEMPLATES_DIR, 'prompts', 'update.md')));

  // Module template stub
  putFile('.ai/modules/_TEMPLATE.md', read(path.join(TEMPLATES_DIR, 'module.md')));

  // Entry point instructions with managed block
  const agentsTemplate = read(path.join(TEMPLATES_DIR, 'AGENTS.md'));
  putManagedBlock('AGENTS.md', renderTemplate(agentsTemplate, templateVars));

  // Selected AI tools → pointer files (managed blocks)
  const applied = applyTargets(root, planTargets(root, selection.ids, { prune: options.prune }));
  log.push(...applied.log);

  return {
    log,
    detected,
    targets: { ids: selection.ids, source: selection.source, config: applied.config }
  };
}

module.exports = {
  initProject,
  init: initProject
};
