'use strict';

const path = require('path');
const { installPreCommitHook } = require('../../services/hook.service');

/**
 * Handles the `repocanon hook` CLI command.
 */
function handleHook(context) {
  const { root, ui } = context;
  const message = installPreCommitHook(root);
  const failed = /no \.git/.test(message);
  ui.header('hook', path.basename(root));
  ui.row(failed ? ui.symbol.error : ui.symbol.ok, '.git/hooks/pre-commit', message);
  if (failed) {
    ui.verdict({ errors: 1, errorText: 'Not a git repository', extra: 'run git init first' });
    process.exitCode = 1;
    return;
  }
  ui.rows([
    [ui.symbol.error, 'blocks', 'commits that add an API key, token or password to AGENTS.md or .ai/'],
    [ui.symbol.warn, 'warns', 'when code changes without any .ai/ update'],
    [ui.symbol.info, 'needs', 'repocanon installed: npm i -D repocanon (or globally)']
  ]);
  ui.verdict({ ok: 'Pre-commit hook ready', extra: 'skip once with git commit --no-verify' });
}

module.exports = {
  handleHook
};
