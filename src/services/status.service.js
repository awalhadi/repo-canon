'use strict';

const fs = require('fs');
const path = require('path');
const { exists, read, write, toSlug } = require('../core/fs');
const { parseFrontmatter, setFrontmatterValue } = require('../core/frontmatter');
const {
  isInsideGitRepo,
  isValidRef,
  getHeadShort,
  getUncommittedPaths,
  getSignificantChanges,
  execGit
} = require('../core/git');
const { loadConfig } = require('../core/config');
const { getDriftOptions } = require('../core/drift');
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
 * @returns {Array<{ doc: string, state: 'fresh'|'stale'|'broken'|'unverified'|'unknown'|'n/a', detail: string, ignored: number, verifiedBy: string|null }>}
 */
function getDocStatus(root) {
  const isGit = isInsideGitRepo(root);
  const driftOptions = getDriftOptions(loadConfig(root));
  const rows = [];

  for (const doc of getKnowledgeDocs(root)) {
    const verifiedAt = doc.fm.verified_at;
    const paths = Array.isArray(doc.fm.code_paths) ? doc.fm.code_paths : [];
    const isModule = doc.rel.includes('/modules/');

    let state;
    let detail = '';
    let ignoredCount = 0;

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
      const { significant, ignored } = getSignificantChanges(root, verifiedAt, paths, driftOptions);
      const ignoredNote = ignored.length ? ` (${ignored.length} test/doc/formatting change(s) ignored)` : '';
      state = significant.length > 0 ? 'stale' : 'fresh';
      detail = significant.length > 0
        ? `${significant.length} code file(s) changed since verify${ignoredNote}`
        : ignoredNote.trim().replace(/^\(|\)$/g, '');
      ignoredCount = ignored.length;
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
      detail,
      ignored: ignoredCount,
      verifiedBy: doc.fm.verified_by || null
    });
  }

  return rows;
}

/**
 * Short name a doc is stamped by: module slug for module docs, file name for core docs.
 *
 * @param {string} rel - Doc path relative to root
 * @returns {string}
 */
function getDocName(rel) {
  return path.posix.basename(rel, '.md');
}

/**
 * Exact (never substring) match of a user-given name against a doc.
 * Modules match by slug, core docs case-insensitively; a trailing ".md" is ignored.
 *
 * @param {string} rel
 * @param {string} name
 * @returns {boolean}
 */
function matchesDocName(rel, name) {
  const bare = String(name).replace(/\.md$/i, '');
  const docName = getDocName(rel);
  return rel.includes('/modules/')
    ? toSlug(bare) === docName
    : bare.toLowerCase() === docName.toLowerCase();
}

/**
 * Pathspecs whose uncommitted changes make stamping a doc unsafe:
 * a module doc's code_paths, or the whole tree outside .ai/ for core docs.
 *
 * @param {{ rel: string, fm: Record<string, any> }} doc
 * @returns {string[]}
 */
function getStampGuardPaths(doc) {
  if (doc.rel.includes('/modules/')) {
    return Array.isArray(doc.fm.code_paths) ? doc.fm.code_paths : [];
  }
  return ['.', ':(exclude).ai'];
}

/**
 * Sets verified_at to the current HEAD commit on the named docs (or all with `all`),
 * and verified_by to who checked them.
 * Names match exactly; nothing is stamped when any name is unknown or none is given.
 * A doc whose code has uncommitted changes is refused unless `force` — its claims
 * would otherwise be "verified" against code that HEAD does not contain.
 * An agent must name each doc it checked and can never force.
 *
 * @param {string} root - Project root directory
 * @param {{ names?: string[], all?: boolean, force?: boolean, by?: 'human'|'agent' }|string} [options={}]
 *   A plain string is treated as a single name.
 * @returns {{
 *   head: string|null,
 *   stamped: string[],
 *   refused: Array<{ doc: string, reason: string }>,
 *   unknown: string[],
 *   needsTarget: boolean,
 *   known: string[]
 * }}
 */
function stampDocs(root, options = {}) {
  const { names = [], all: allRequested = false, force: forceRequested = false, by = 'human' } =
    typeof options === 'string' ? { names: [options] } : options;
  const all = by === 'agent' ? false : allRequested;
  const force = by === 'agent' ? false : forceRequested;
  const docs = getKnowledgeDocs(root);
  const result = {
    head: getHeadShort(root),
    stamped: [],
    refused: [],
    unknown: [],
    needsTarget: false,
    known: docs.map(doc => getDocName(doc.rel))
  };

  if (!result.head) {
    return result;
  }

  let targets = docs;
  if (!all) {
    if (!names.length) {
      result.needsTarget = true;
      return result;
    }
    targets = docs.filter(doc => names.some(name => matchesDocName(doc.rel, name)));
    result.unknown = names.filter(name => !docs.some(doc => matchesDocName(doc.rel, name)));
    if (result.unknown.length) {
      return result;
    }
  }

  for (const doc of targets) {
    const dirty = force ? [] : getUncommittedPaths(root, getStampGuardPaths(doc));
    if (dirty.length) {
      const sample = dirty.slice(0, 3).join(', ') + (dirty.length > 3 ? ` +${dirty.length - 3} more` : '');
      result.refused.push({
        doc: doc.rel,
        reason: `uncommitted changes (${sample}) — commit first, then stamp (or --force)`
      });
      continue;
    }
    const stamped = setFrontmatterValue(doc.text, 'verified_at', result.head);
    write(path.join(root, doc.rel), setFrontmatterValue(stamped, 'verified_by', by));
    result.stamped.push(doc.rel);
  }

  return result;
}

module.exports = {
  getKnowledgeDocs,
  docsIn: getKnowledgeDocs,
  getDocStatus,
  status: getDocStatus,
  stampDocs,
  stamp: stampDocs,
  matchesDocName
};
