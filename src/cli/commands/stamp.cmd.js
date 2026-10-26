'use strict';

const { stampDocs } = require('../../services/status.service');

/**
 * Handles the `repocanon stamp` CLI command.
 */
function handleStamp(context) {
  const { root, args } = context;
  const target = args[0] || undefined;
  const stamped = stampDocs(root, target);

  if (stamped.length) {
    console.log(stamped.map(doc => `✓ ${doc}`).join('\n'));
  } else {
    console.log('nothing stamped (needs a git commit)');
  }
}

module.exports = {
  handleStamp
};
