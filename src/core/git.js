'use strict';

const cp = require('child_process');

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

module.exports = {
  execGit,
  isSafeRef,
  isValidRef,
  isInsideGitRepo,
  getHeadShort,
  getCurrentBranch,
  getCommitCount,
  getChangedFilesSince,
  getDiffForPaths,
  listGitFiles
};
