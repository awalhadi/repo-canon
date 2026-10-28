'use strict';

/**
 * Changes that never make a knowledge doc stale: tests, prose docs and lockfiles
 * describe or pin the code without changing its behaviour or rules; build output
 * (Python caches) isn't the code at all.
 */
const IGNORED_KINDS = [
  ['tests', /(^|\/)(tests?|__tests__|spec|specs)\/|\.(test|spec)\.[a-z0-9]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i],
  ['docs', /\.(md|mdx|txt|rst)$/i],
  ['build output', /(^|\/)(__pycache__|\.pytest_cache|\.mypy_cache)\/|\.py[co]$/],
  ['lockfile', /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|composer\.lock|Cargo\.lock|go\.sum|poetry\.lock|Gemfile\.lock|uv\.lock)$/]
];

/**
 * Converts a user pattern from `driftIgnore` into a test: a trailing "/" is a folder
 * prefix, `*` matches within a path segment, `**` across segments.
 *
 * @param {string} pattern
 * @returns {(file: string) => boolean}
 */
function toMatcher(pattern) {
  if (pattern.endsWith('/') && !pattern.includes('*')) {
    return file => file.startsWith(pattern);
  }
  const source = pattern
    .split('**')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*');
  const re = new RegExp(pattern.includes('/') ? `^${source}$` : `(^|/)${source}$`);
  return file => re.test(file);
}

/**
 * Why a changed file doesn't count toward staleness, or null if it does.
 *
 * @param {string} file - repo-relative path
 * @param {string[]} [extraPatterns=[]] - `driftIgnore` from .repocanon.json
 * @returns {string|null}
 */
function classifyPath(file, extraPatterns = []) {
  if (file.startsWith('.ai/')) return null;
  const kind = IGNORED_KINDS.find(([, re]) => re.test(file));
  if (kind) return kind[0];
  return extraPatterns.some(p => toMatcher(p)(file)) ? 'driftIgnore' : null;
}

/**
 * Options for git.getSignificantChanges, built from project config.
 * `drift: "all"` restores the old rule: every changed file counts, whitespace included.
 *
 * @param {{ drift?: string, driftIgnore?: string[] }} config
 * @returns {{ all: boolean, classify: (file: string) => string|null }}
 */
function getDriftOptions(config) {
  const extra = config.driftIgnore || [];
  return { all: config.drift === 'all', classify: file => classifyPath(file, extra) };
}

module.exports = {
  classifyPath,
  getDriftOptions,
  toMatcher
};
