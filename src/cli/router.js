'use strict';

const pkg = require('../../package.json');
const { parseArgs } = require('./args');
const { getHelpText } = require('./formatters');
const { handleInit } = require('./commands/init.cmd');
const { handleAnalyze } = require('./commands/analyze.cmd');
const { handleDoctor } = require('./commands/doctor.cmd');
const { handleStatus } = require('./commands/status.cmd');
const { handleSync } = require('./commands/sync.cmd');
const { handleContext } = require('./commands/context.cmd');
const { handleStamp } = require('./commands/stamp.cmd');
const { handleHook } = require('./commands/hook.cmd');
const { handlePrompt } = require('./commands/prompt.cmd');
const { handleMcp } = require('./commands/mcp.cmd');
const { handleSecrets } = require('./commands/secrets.cmd');
const { handleSetup } = require('./commands/setup.cmd');

const COMMAND_HANDLERS = {
  init: handleInit,
  analyze: handleAnalyze,
  doctor: handleDoctor,
  status: handleStatus,
  sync: handleSync,
  context: handleContext,
  stamp: handleStamp,
  hook: handleHook,
  prompt: handlePrompt,
  mcp: handleMcp,
  secrets: handleSecrets,
  setup: handleSetup
};

/**
 * Main CLI router and execution entrypoint.
 *
 * @param {string[]} [rawArgv=process.argv.slice(2)]
 * @returns {Promise<void>}
 */
async function runCli(rawArgv = process.argv.slice(2)) {
  try {
    const context = parseArgs(rawArgv);

    if (context.isVersion) {
      console.log(pkg.version);
      return;
    }

    if (context.isHelp || !context.command) {
      console.log(getHelpText());
      return;
    }

    const handler = COMMAND_HANDLERS[context.command];
    if (handler) {
      await handler(context);
    } else {
      console.log(getHelpText());
    }
  } catch (error) {
    console.error(`repocanon: ${error.message}`);
    process.exit(Number.isInteger(error.exitCode) ? error.exitCode : 2);
  }
}

module.exports = {
  runCli,
  COMMAND_HANDLERS
};
