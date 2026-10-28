'use strict';

const path = require('path');
const { getClaims, formatClaimSummary } = require('../../services/claims.service');
const { printJson } = require('../formatters');

/**
 * Handles the `repocanon claims` CLI command: every checked claim with its tier and
 * state. Exits 1 when a claim is broken, or also when one is stale with `--ci`.
 */
function handleClaims(context) {
  const { root, isJson, isCi, ui } = context;
  const report = getClaims(root);
  const broken = report.claims.filter(c => c.state === 'broken');
  const stale = report.claims.filter(c => c.state === 'stale');

  if (isJson) {
    printJson({ ...report, summary: formatClaimSummary(report) });
  } else {
    const { symbol } = ui;
    const icon = { fresh: symbol.ok, stale: symbol.warn, unlocked: symbol.info, broken: symbol.error };
    ui.header('claims', path.basename(root));
    const docs = [...new Set(report.claims.map(c => c.doc))];
    for (const doc of docs) {
      const claims = report.claims.filter(c => c.doc === doc);
      ui.section(doc, claims.length);
      ui.rows(claims.map(c => [icon[c.state], c.id, `${c.tier} · ${c.state}${c.detail ? ` — ${c.detail}` : ''}`]));
    }
    if (!report.claims.length) {
      ui.row(symbol.info, 'No checked claims yet');
    }
    ui.verdict({
      errors: broken.length,
      warnings: stale.length,
      errorText: `${broken.length} broken claim(s)`,
      warningText: `${stale.length} stale claim(s)`,
      ok: formatClaimSummary(report)
    });
    if (!report.claims.length) {
      ui.hint('tie a rule to code: - Money is integer cents. <!-- rc: anchor=src/money.js#toCents -->');
      ui.hint('or to a test:       - Floats are rejected. <!-- rc: test=test/money.test.js#rejects floats -->');
    } else if (report.claims.some(c => c.state === 'unlocked' || c.state === 'stale')) {
      ui.hint('re-read the code, fix the rule if needed, commit, then: repocanon stamp <doc>');
    }
  }

  if (broken.length || (isCi && stale.length)) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleClaims
};
