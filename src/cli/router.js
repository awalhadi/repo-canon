'use strict';

const pkg = require('../../package.json');
const { parseArgs } = require('./args');
const { CommandError } = require('../core/errors');
const { getUi, getErrorUi } = require('./ui');
const { findCommand, suggestCommand, printOverview, printCommandHelp } = require('./help');
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
const { handleAgentHook } = require('./commands/agent-hook.cmd');
const { handleRules } = require('./commands/rules.cmd');
const { handleAdopt } = require('./commands/adopt.cmd');
const { handleReport } = require('./commands/report.cmd');
const { handleSkills } = require('./commands/skills.cmd');

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
  setup: handleSetup,
  'agent-hook': handleAgentHook,
  rules: handleRules,
  skills: handleSkills,
  adopt: handleAdopt,
  report: handleReport
};

/**
 * Main CLI router and execution entrypoint.
 *
 * @param {string[]} [rawArgv=process.argv.slice(2)]
 * @returns {Promise<void>}
 */
async function runCli(rawArgv = process.argv.slice(2)) {
  // `repocanon status | head` closes the pipe early: stop quietly, like other CLIs
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', error => {
      if (error.code === 'EPIPE') process.exit(0);
      throw error;
    });
  }
  let context = { noColor: rawArgv.includes('--no-color'), isDebug: rawArgv.includes('--debug') };
  try {
    context = parseArgs(rawArgv);
    // Machine formats never get colour, whatever the terminal
    const plain = context.noColor || context.isJson || context.options.format === 'github' || context.options.format === 'json';
    const ui = getUi({ noColor: plain });
    context.ui = ui;

    if (context.isVersion) {
      console.log(pkg.version);
      return;
    }

    // `repocanon help status`, `repocanon status --help`, or plain `repocanon`
    const helpTarget = context.command === 'help' ? context.args[0] : context.command;
    if (context.isHelp || !context.command) {
      const command = helpTarget && findCommand(helpTarget);
      if (command) printCommandHelp(ui, command);
      else printOverview(ui);
      return;
    }

    const handler = COMMAND_HANDLERS[context.command];
    if (!handler) {
      const guess = suggestCommand(context.command);
      throw new CommandError(
        `unknown command "${context.command}"`,
        2,
        guess ? `did you mean \`repocanon ${guess}\`? · all commands: repocanon --help` : 'all commands: repocanon --help'
      );
    }
    await handler(context);
  } catch (error) {
    const ui = getErrorUi({ noColor: context.noColor });
    ui.line(`${ui.symbol.error} ${ui.c.bold(error.message)}`);
    if (error.hint) ui.hint(error.hint);
    if (context.isDebug && error.stack) ui.line(ui.c.dim(error.stack));
    process.exit(Number.isInteger(error.exitCode) ? error.exitCode : 2);
  }
}

module.exports = {
  runCli,
  COMMAND_HANDLERS
};
