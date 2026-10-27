'use strict';

const fs = require('fs');
const path = require('path');
const { TOKEN_SKIP_EXTENSIONS } = require('./constants');
const { listWorkspaceFiles } = require('./fs');

/**
 * Estimates token count from text.
 *
 * Word/punctuation-aware heuristic (~BPE-shaped) instead of a flat chars/4
 * ratio: prose and identifier-heavy code tokenize differently, and a single
 * bytes/4 constant over- or under-counts by 20-30% depending on the mix.
 * Still zero-dependency — no real tokenizer is loaded.
 *
 * @param {string|null|undefined} text
 * @returns {number}
 */
function estimateTokens(text) {
  const value = text || '';
  if (!value) return 0;

  // Split into word-ish runs and punctuation/symbol runs separately, since
  // BPE tokenizers roughly do the same before merging sub-word pieces.
  const pieces = value.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]+/g) || [];
  let tokens = 0;

  for (const piece of pieces) {
    if (/^[A-Za-z0-9_]+$/.test(piece)) {
      // camelCase / snake_case / long identifiers split into sub-word
      // pieces under real BPE; approximate with length-based sub-splitting.
      const subWords = piece.split(/(?<=[a-z0-9])(?=[A-Z])|_/).filter(Boolean);
      for (const sub of subWords) {
        tokens += Math.max(1, Math.ceil(sub.length / 4));
      }
    } else {
      // Punctuation/symbol runs: roughly one token per 1-2 characters.
      tokens += Math.max(1, Math.ceil(piece.length / 2));
    }
  }

  return Math.max(tokens, Math.ceil(value.length / 6));
}

/**
 * Cuts text to the longest prefix whose estimateTokens() fits maxTokens,
 * so a truncated section is measured by the same estimator that budgets it.
 *
 * @param {string|null|undefined} text
 * @param {number} maxTokens
 * @returns {string}
 */
function truncateToTokens(text, maxTokens) {
  const value = text || '';
  if (estimateTokens(value) <= maxTokens) return value;

  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(value.slice(0, mid)) <= maxTokens) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return value.slice(0, lo);
}

/**
 * Estimates total source tokens across the entire repository.
 * Skips binaries, archives, lockfiles, and files larger than 1MB.
 * Uses the fast bytes/4 approximation (not estimateTokens' word-aware pass)
 * since this reads file sizes only, never file content, to stay fast on
 * large repos.
 *
 * @param {string} root - Project root directory
 * @param {string[]} [preloadedFiles=null] - Optional pre-scanned file list
 * @returns {number} Estimated token count
 */
function estimateRepoTokens(root, preloadedFiles = null) {
  const files = preloadedFiles || listWorkspaceFiles(root);
  let totalBytes = 0;

  for (const file of files) {
    if (TOKEN_SKIP_EXTENSIONS.test(file)) {
      continue;
    }
    try {
      const stat = fs.statSync(path.join(root, file));
      if (stat.isFile() && stat.size < 1e6) {
        totalBytes += stat.size;
      }
    } catch {
      // Ignore unreadable or transient files
    }
  }

  return Math.ceil(totalBytes / 4);
}

module.exports = {
  estimateTokens,
  truncateToTokens,
  estimateRepoTokens
};
