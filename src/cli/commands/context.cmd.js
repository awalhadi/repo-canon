'use strict';

const { packContext } = require('../../services/pack.service');
const { printJson } = require('../formatters');

/**
 * Handles the `contextforge context` CLI command.
 */
function handleContext(context) {
  const { root, args, options, isJson } = context;
  const filesList = (options.files || '').split(',').filter(Boolean);
  const maxTokens = Number(options.max) || 4000;

  const result = packContext(root, {
    query: args.join(' '),
    files: filesList,
    maxTokens
  });

  if (isJson) {
    printJson(result);
    return;
  }

  console.log(result.text);

  const matchedModules = result.modules.join(', ') || 'none matched';
  const skippedDetails = result.skipped.length ? ` | skipped: ${result.skipped.join(', ')}` : '';
  console.error(`\n[~${result.tokens} tokens | modules: ${matchedModules}${skippedDetails}]`);
}

module.exports = {
  handleContext
};
