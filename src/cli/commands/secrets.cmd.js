'use strict';

const { scanSecrets, scanStagedSecrets, formatSecretFinding } = require('../../services/secrets.service');
const { printJson } = require('../formatters');

/**
 * Handles the `repocanon secrets` CLI command. Exits 1 when anything is found,
 * so the pre-commit hook and CI can stop on it.
 */
function handleSecrets(context) {
  const { root, flags, isJson } = context;
  const staged = flags.has('--staged');
  const results = staged ? scanStagedSecrets(root) : scanSecrets(root);

  if (isJson) {
    printJson(results);
  } else if (results.length) {
    for (const { doc, findings } of results) {
      findings.forEach(item => console.log(`✗ ${formatSecretFinding(doc, item)}`));
    }
  } else if (!flags.has('--quiet')) {
    console.log(`✓ no secrets in ${staged ? 'staged ' : ''}AGENTS.md / .ai/ docs`);
  }

  if (results.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleSecrets
};
