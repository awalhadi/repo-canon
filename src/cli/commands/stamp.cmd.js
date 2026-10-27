'use strict';

const { stampDocs } = require('../../services/status.service');
const { CommandError } = require('../../core/errors');

/**
 * Handles the `repocanon stamp` CLI command.
 */
function handleStamp(context) {
  const { root, args, flags } = context;
  const result = stampDocs(root, {
    names: args,
    all: flags.has('--all'),
    force: flags.has('--force')
  });

  if (!result.head) {
    console.log('nothing stamped (needs a git commit)');
    return;
  }

  const knownList = result.known.join(', ') || 'none — run: repocanon init';
  if (result.needsTarget) {
    throw new CommandError(`stamp needs a doc name (or --all). Known: ${knownList}`, 1);
  }
  if (result.unknown.length) {
    throw new CommandError(`no doc named ${result.unknown.join(', ')} — nothing stamped. Known: ${knownList}`, 1);
  }

  const lines = [
    ...result.stamped.map(doc => `✓ ${doc}`),
    ...result.refused.map(({ doc, reason }) => `✗ ${doc}: ${reason}`)
  ];
  console.log(lines.join('\n'));

  if (result.refused.length) {
    process.exitCode = 1;
  }
}

module.exports = {
  handleStamp
};
