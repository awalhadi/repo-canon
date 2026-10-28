'use strict';

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Executes git command safely using execFileSync without shell invocation.
 *
 * @param {string} cwd - Current working directory
 * @param {string[]} args - Git command arguments
 * @returns {string|null} Command output or null on error
 */
function execGit(cwd, args) {
  try {
    return cp.execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 1 << 28 // 256MB buffer for large monorepos
    }).toString().trim();
  } catch {
    return null;
  }
}

/**
 * Validates whether a git ref is syntactically safe and does not attempt flag/option injection.
 *
 * @param {any} ref - The candidate git reference string
 * @returns {boolean} True if safe, false otherwise
 */
function isSafeRef(ref) {
  return (
    typeof ref === 'string' &&
    ref.length > 0 &&
    ref.length < 200 &&
    !ref.startsWith('-') &&
    /^[A-Za-z0-9._/~^@{}-]+$/.test(ref)
  );
}

/**
 * Checks if a reference exists and resolves to a valid commit in the repository.
 *
 * @param {string} cwd - Repository working directory
 * @param {string} ref - The git reference
 * @returns {boolean} True if ref is valid commit
 */
function isValidRef(cwd, ref) {
  if (!isSafeRef(ref)) {
    return false;
  }
  return execGit(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null;
}

/**
 * Determines whether the given directory is inside a git working tree.
 *
 * @param {string} cwd - Directory path
 * @returns {boolean}
 */
function isInsideGitRepo(cwd) {
  return execGit(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true';
}

/**
 * Gets the current HEAD short commit hash.
 *
 * @param {string} cwd - Repository directory
 * @returns {string|null} Commit hash or null
 */
function getHeadShort(cwd) {
  return execGit(cwd, ['rev-parse', '--short', 'HEAD']);
}

/**
 * Gets the current branch name.
 *
 * @param {string} cwd - Repository directory
 * @returns {string|null} Branch name or null
 */
function getCurrentBranch(cwd) {
  return execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

/**
 * Counts total commits on HEAD.
 *
 * @param {string} cwd - Repository directory
 * @returns {string|null} Total commits
 */
function getCommitCount(cwd) {
  return execGit(cwd, ['rev-list', '--count', 'HEAD']);
}

/**
 * Gets modified files since a specific ref plus untracked files.
 *
 * @param {string} cwd - Repository directory
 * @param {string} ref - Git reference
 * @returns {string[]} List of changed file paths
 */
function getChangedFilesSince(cwd, ref) {
  const diffOutput = execGit(cwd, ['diff', '--name-only', ref, '--']) || '';
  const untrackedOutput = execGit(cwd, ['ls-files', '--others', '--exclude-standard']) || '';
  const combined = `${diffOutput}\n${untrackedOutput}`;

  return [...new Set(combined.split('\n').filter(f => f && !f.startsWith('.ai/')))];
}

/**
 * Gets diff for specific paths since a ref up to HEAD.
 *
 * @param {string} cwd
 * @param {string} ref
 * @param {string[]} paths
 * @returns {string[]} List of modified files
 */
function getDiffForPaths(cwd, ref, paths) {
  const safePaths = paths.filter(p => !p.startsWith('-'));
  if (!safePaths.length) {
    return [];
  }
  const diff = execGit(cwd, ['diff', '--name-only', `${ref}..HEAD`, '--', ...safePaths]);
  return diff ? diff.split('\n').filter(Boolean) : [];
}

/**
 * Lists uncommitted (modified, staged or untracked) files under the given pathspecs.
 *
 * @param {string} cwd
 * @param {string[]} paths - Pathspecs; entries starting with '-' are dropped
 * @returns {string[]} Dirty file paths (empty when clean or no usable paths)
 */
function getUncommittedPaths(cwd, paths) {
  const safePaths = paths.filter(p => typeof p === 'string' && p && !p.startsWith('-'));
  if (!safePaths.length) {
    return [];
  }
  const out = execGit(cwd, ['status', '--porcelain', '--untracked-files=all', '--', ...safePaths]);
  // execGit trims the output, so the status column can't be cut at a fixed offset
  return out ? out.split('\n').filter(Boolean).map(line => line.trim().replace(/^\S+\s+/, '')) : [];
}

/**
 * Splits files changed since `ref` into the ones that matter for docs and the ones that
 * don't: whitespace/formatting-only edits, and paths `classify` rejects (tests, docs…).
 *
 * @param {string} cwd
 * @param {string} ref - commit to compare from
 * @param {string[]} paths - pathspecs to limit the diff
 * @param {{ workingTree?: boolean, classify?: (file: string) => string|null, all?: boolean }} [options={}]
 *   workingTree: compare against the working tree (plus untracked files) instead of HEAD;
 *   all: count every changed file (the `drift: "all"` setting)
 * @returns {{ significant: string[], ignored: Array<{ file: string, reason: string }> }}
 */
function getSignificantChanges(cwd, ref, paths, options = {}) {
  const safePaths = paths.filter(p => typeof p === 'string' && p && !p.startsWith('-'));
  if (!safePaths.length) {
    return { significant: [], ignored: [] };
  }
  const range = options.workingTree ? ref : `${ref}..HEAD`;
  const lines = out => (out ? out.split('\n').filter(Boolean) : []);

  // --no-renames: a moved file is a delete + add, which matters for docs; a rename would look whitespace-only
  const changed = lines(execGit(cwd, ['diff', '--name-only', '--no-renames', range, '--', ...safePaths]));
  if (options.workingTree) {
    changed.push(...lines(execGit(cwd, ['ls-files', '--others', '--exclude-standard', '--', ...safePaths])));
  }
  // Files whose only edits are whitespace or blank lines drop out of this list
  const substantive = new Set(
    lines(execGit(cwd, ['diff', '--numstat', '--no-renames', '-w', '--ignore-blank-lines', range, '--', ...safePaths]))
      .map(line => line.split('\t').slice(2).join('\t'))
  );
  const untracked = new Set(options.workingTree
    ? lines(execGit(cwd, ['ls-files', '--others', '--exclude-standard', '--', ...safePaths]))
    : []);

  const significant = [];
  const ignored = [];
  for (const file of [...new Set(changed)]) {
    const reason = !options.all && options.classify ? options.classify(file) : null;
    if (options.all) {
      significant.push(file);
    } else if (reason) {
      ignored.push({ file, reason });
    } else if (!substantive.has(file) && !untracked.has(file) && fs.existsSync(path.join(cwd, file))) {
      ignored.push({ file, reason: 'whitespace/formatting only' });
    } else {
      significant.push(file);
    }
  }
  return { significant, ignored };
}

/**
 * Lists files staged for the next commit (added, copied, modified or renamed).
 *
 * @param {string} cwd
 * @returns {string[]}
 */
function getStagedFiles(cwd) {
  const out = execGit(cwd, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
  return out ? out.split('\0').filter(Boolean) : [];
}

/**
 * Reads the staged (index) version of a file. The `:path` form can never be parsed as an option.
 *
 * @param {string} cwd
 * @param {string} file - repo-relative path, as returned by getStagedFiles
 * @returns {string|null}
 */
function readStagedFile(cwd, file) {
  return execGit(cwd, ['show', `:${file}`]);
}

/**
 * Lists all git tracked and untracked non-ignored files using null-delimited output.
 *
 * @param {string} cwd
 * @returns {string[]|null}
 */
function listGitFiles(cwd) {
  const out = execGit(cwd, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  if (out === null) {
    return null;
  }
  return out.split('\0').filter(f => f && !f.startsWith('.ai/'));
}

/**
 * Lists untracked files that .gitignore does not hide: on disk, but never committed or reviewed.
 *
 * @param {string} cwd
 * @returns {string[]}
 */
function getUntrackedFiles(cwd) {
  const out = execGit(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
  return out ? out.split('\0').filter(Boolean) : [];
}

module.exports = {
  execGit,
  getUntrackedFiles,
  isSafeRef,
  isValidRef,
  isInsideGitRepo,
  getHeadShort,
  getCurrentBranch,
  getCommitCount,
  getChangedFilesSince,
  getDiffForPaths,
  getUncommittedPaths,
  getSignificantChanges,
  getStagedFiles,
  readStagedFile,
  listGitFiles
};
