'use strict';

const { installPreCommitHook } = require('../../services/hook.service');

/**
 * Handles the `repocanon hook` CLI command.
 */
function handleHook(context) {
  const { root } = context;
  const message = installPreCommitHook(root);
  console.log(`pre-commit: ${message}`);
}

module.exports = {
  handleHook
};
