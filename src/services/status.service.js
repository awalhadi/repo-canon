'use strict';

const fs = require('fs');
const path = require('path');
const { exists, read, write } = require('../core/fs');
const { parseFrontmatter, setFrontmatterValue } = require('../core/frontmatter');
const {
  isInsideGitRepo,
  isValidRef,
  getHeadShort,
  execGit
} = require('../core/git');
const { CORE_DOCS } = require('../core/constants');

/**
 * Discovers all existing knowledge layer documentation files in .ai/.
 *
 * @param {string} root - Project root directory
 * @returns {Array<{ rel: string, text: string, fm: Record<string, any> }>}
 */
function getKnowledgeDocs(root) {
  const docs = [];
  const addDoc = relPath => {
    const content = read(path.join(root, relPath));
    if (content !== null) {
      docs.push({
        rel: relPath,
        text: content,
        fm: parseFrontmatter(content)
      });
    }
  };

  for (const docName of CORE_DOCS) {
    addDoc(`.ai/${docName}.md`);
  }

  const modulesDir = path.join(root, '.ai', 'modules');
  if (fs.existsSync(modulesDir)) {
    try {
      const moduleFiles = fs.readdirSync(modulesDir);
      for (const fileName of moduleFiles) {
        if (fileName.endsWith('.md') && !fileName.startsWith('_')) {
          addDoc(`.ai/modules/${fileName}`);
        }
      }
    } catch {
      // Ignore read error
    }
  }

  return docs;
}

/**
 * Checks freshness status of every doc in .ai/ relative to Git commits.
 *
 * @param {string} root - Project root directory
 * @returns {Array<{ doc: string, state: 'fresh'|'stale'|'broken'|'unverified'|'unknown'|'n/a', detail: string }>}
 */
function getDocStatus(root) {
  const isGit = isInsideGitRepo(root);
  const rows = [];

  for (const doc of getKnowledgeDocs(root)) {
    const verifiedAt = doc.fm.verified_at;
    const paths = Array.isArray(doc.fm.code_paths) ? doc.fm.code_paths : [];
    const isModule = doc.rel.includes('/modules/');

    let state;
    let detail = '';

    if (!isGit) {
      state = 'n/a';
      detail = 'not a git repo';
    } else if (!verifiedAt) {
      state = 'unverified';
      detail = 'verified_at empty';
    } else if (!isValidRef(root, verifiedAt)) {
      state = 'unknown';
      detail = 'hash not in history';
    } else if (isModule && paths.length > 0) {
      const safePaths = paths.filter(p => !p.startsWith('-'));
      const diffOutput = execGit(root, [
        'diff',
        '--name-only',
        `${verifiedAt}..HEAD`,
        '--',
        ...safePaths
      ]);
      const changedCount = diffOutput ? diffOutput.split('\n').length : 0;
      state = changedCount > 0 ? 'stale' : 'fresh';
      detail = changedCount > 0 ? `${changedCount} code file(s) changed since verify` : '';
    } else {
      state = 'fresh';
      const commitCount = execGit(root, ['rev-list', '--count', `${verifiedAt}..HEAD`]);
      detail = `${commitCount} commit(s) since verify`;
    }

    const missingPaths = isModule ? paths.filter(p => !exists(path.join(root, p))) : [];
    if (missingPaths.length > 0) {
      state = 'broken';
      detail = `paths missing: ${missingPaths.join(', ')}`;
    }

    rows.push({
      doc: doc.rel,
      state,
      detail
    });
  }

  return rows;
}

/**
 * Updates verified_at in documents to current HEAD commit.
 *
 * @param {string} root - Project root directory
 * @param {string} [targetModule] - Target module name/slug filter
 * @returns {string[]} List of modified document relative paths
 */
function stampDocs(root, targetModule) {
  const currentHead = getHeadShort(root);
  if (!currentHead) {
    return [];
  }

  const stampedDocs = [];
  for (const doc of getKnowledgeDocs(root)) {
    if (targetModule && !doc.rel.includes(targetModule)) {
      continue;
    }
    const updatedText = setFrontmatterValue(doc.text, 'verified_at', currentHead);
    write(path.join(root, doc.rel), updatedText);
    stampedDocs.push(doc.rel);
  }

  return stampedDocs;
}

module.exports = {
  getKnowledgeDocs,
  docsIn: getKnowledgeDocs,
  getDocStatus,
  status: getDocStatus,
  stampDocs,
  stamp: stampDocs
};
