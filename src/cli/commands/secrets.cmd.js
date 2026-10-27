'use strict';

const path = require('path');
const { scanSecrets, scanStagedSecrets } = require('../../services/secrets.service');
const { printJson } = require('../formatters');

/**
 * Handles the `repocanon secrets` CLI command. Exits 1 when anything is found,
 * so the pre-commit hook and CI can stop on it.
 */
function handleSecrets(context) {
  const { root, flags, isJson, ui } = context;
  const staged = flags.has('--staged');
  const results = staged ? scanStagedSecrets(root) : scanSecrets(root);
  const total = results.reduce((n, entry) => n + entry.findings.length, 0);

  if (isJson) {
    printJson(results);
  } else if (!flags.has('--quiet') || results.length) {
    const { symbol } = ui;
    ui.header(`secrets${staged ? ' --staged' : ''}`, path.basename(root));
    for (const { doc, findings } of results) {
      ui.section(doc, findings.length);
      ui.rows(findings.map(item => [symbol.error, `line ${item.line}`, `possible ${item.kind} (${item.preview})`]));
    }
    if (!results.length) ui.row(symbol.ok, `No secrets in ${staged ? 'the staged ' : ''}AGENTS.md / .ai/ docs`);
    ui.verdict({ errors: total, errorText: `${total} possible secret(s): remove them before committing`, ok: 'Clean' });
    if (total) ui.hint('a false positive? add <!-- repocanon:allow-secret --> on that line');
  }

  if (results.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleSecrets
};
