'use strict';

const path = require('path');
const { exists, read, write, renderTemplate } = require('../core/fs');
const { getHeadShort } = require('../core/git');
const { upsertManagedBlock } = require('../core/blocks');
const { detectProject } = require('../core/detector');
const {
  CORE_DOCS,
  IDE_POINTERS,
  IDE_POINTER_TEXT,
  CURSOR_RULE_PATH,
  CURSOR_RULE_FRONTMATTER
} = require('../core/constants');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

/**
 * Initializes the RepoCanon knowledge layer (.ai/) in a project.
 *
 * @param {string} root - Project root directory
 * @param {{ force?: boolean }} [options={}] - Options (e.g. force overwrite core docs)
 * @returns {{ log: Array<[string, string]>, detected: ReturnType<typeof detectProject> }}
 */
function initProject(root, options = {}) {
  const detected = detectProject(root);
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

  const putManagedBlock = (relPath, body, prefix = '') => {
    const status = upsertManagedBlock(path.join(root, relPath), body, prefix);
    log.push([status, relPath]);
  };

  // Base configurations and ignore files
  const templateConfig = read(path.join(TEMPLATES_DIR, 'repocanon.json')) || read(path.join(TEMPLATES_DIR, 'contextforge.json'));
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

  // IDE pointer files
  for (const pointerFile of IDE_POINTERS) {
    putManagedBlock(pointerFile, IDE_POINTER_TEXT);
  }

  // Cursor rules
  putManagedBlock(CURSOR_RULE_PATH, IDE_POINTER_TEXT, CURSOR_RULE_FRONTMATTER);

  return {
    log,
    detected
  };
}

module.exports = {
  initProject,
  init: initProject
};
