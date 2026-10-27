'use strict';

const { getDocStatus } = require('./status.service');

/**
 * Points per doc state. A stale doc still helps a little (its rules may hold);
 * a broken one points at code that is gone.
 */
const WEIGHTS = { fresh: 100, unverified: 50, unknown: 50, stale: 25, broken: 0 };

/**
 * One number for how far the knowledge layer can be trusted: the average of each
 * doc's points, 0–100. Null when freshness can't be computed (no git, no docs).
 *
 * @param {string} root - Project root directory
 * @param {ReturnType<typeof getDocStatus>} [rows] - reuse rows the caller already has
 * @returns {{ score: number|null, counts: Record<string, number>, docs: number }}
 */
function getFreshnessScore(root, rows = getDocStatus(root)) {
  const counts = { fresh: 0, stale: 0, broken: 0, unverified: 0, unknown: 0 };
  const scored = rows.filter(row => row.state in WEIGHTS);
  scored.forEach(row => { counts[row.state] += 1; });
  const score = scored.length
    ? Math.round(scored.reduce((sum, row) => sum + WEIGHTS[row.state], 0) / scored.length)
    : null;
  return { score, counts, docs: scored.length };
}

/**
 * @param {ReturnType<typeof getFreshnessScore>} result
 * @returns {string} e.g. "Freshness 82/100 · 1 stale, 0 broken, 2 unverified"
 */
function formatScore(result) {
  if (result.score === null) return 'Freshness: n/a (needs git and at least one doc)';
  const { stale, broken, unverified } = result.counts;
  return `Freshness ${result.score}/100 · ${stale} stale, ${broken} broken, ${unverified} unverified`;
}

module.exports = {
  getFreshnessScore,
  formatScore,
  SCORE_WEIGHTS: WEIGHTS
};
