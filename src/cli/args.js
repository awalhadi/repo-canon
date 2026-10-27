'use strict';

const path = require('path');

/** Flags that never take a value, so `stamp --force billing` keeps `billing` as a name. */
const BOOLEAN_FLAGS = new Set([
  'json', 'ci', 'help', 'version', 'no-color', 'debug', 'yes', 'prune', 'force', 'all', 'check', 'strict',
  'scaffold', 'write', 'dry-run', 'move', 'staged', 'quiet', 'compact', 'keep'
]);

/**
 * Parses raw command-line arguments into structured commands, flags, and options.
 *
 * @param {string[]} argv - Arguments array (usually process.argv.slice(2))
 * @returns {{
 *   command: string,
 *   args: string[],
 *   flags: Set<string>,
 *   options: Record<string, string>,
 *   root: string,
 *   isJson: boolean,
 *   isCi: boolean,
 *   isHelp: boolean,
 *   isVersion: boolean,
 *   noColor: boolean,
 *   isDebug: boolean
 * }}
 */
function parseArgs(argv = []) {
  const flags = new Set();
  const options = {};
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      flags.add(arg);

      if (arg.includes('=')) {
        const [key, ...rest] = arg.slice(2).split('=');
        options[key] = rest.join('=');
      } else {
        const key = arg.slice(2);
        // Check if next argument is a value rather than another flag
        const nextArg = argv[i + 1];
        if (nextArg && !nextArg.startsWith('-') && !BOOLEAN_FLAGS.has(key)) {
          options[key] = nextArg;
          i++;
        }
      }
    } else if (arg.startsWith('-')) {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }

  const command = positional[0] || '';
  const args = positional.slice(1);

  const rootOption = options.root || null;
  const root = path.resolve(rootOption || process.cwd());

  const isJson = flags.has('--json');
  const isCi = flags.has('--ci');
  const isHelp = flags.has('--help') || flags.has('-h') || command === 'help';
  const isVersion = flags.has('--version') || flags.has('-v') || command === 'version';

  return {
    command,
    args,
    flags,
    options,
    root,
    isJson,
    isCi,
    isHelp,
    isVersion,
    noColor: flags.has('--no-color'),
    isDebug: flags.has('--debug')
  };
}

module.exports = {
  parseArgs
};
