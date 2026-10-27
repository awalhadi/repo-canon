'use strict';

const { packContext } = require('../../services/pack.service');
const { printJson } = require('../formatters');
const { getErrorUi } = require('../ui');

/**
 * Handles the `repocanon context` CLI command.
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

  // Status goes to stderr so `context … | pbcopy` copies only the pack
  const ui = getErrorUi({ noColor: context.noColor });
  const staleCount = Object.values(result.freshness).filter(state => state === 'stale' || state === 'broken').length;
  ui.line('');
  ui.row(ui.symbol.info, `~${result.tokens.toLocaleString('en-US')} tokens of ${maxTokens.toLocaleString('en-US')}`, [
    `modules: ${result.modules.join(', ') || 'none matched'}`,
    result.skipped.length ? `skipped: ${result.skipped.join(', ')}` : '',
    staleCount ? `${staleCount} stale (labelled in the pack)` : ''
  ].filter(Boolean).join(' · '));
}

module.exports = {
  handleContext
};
