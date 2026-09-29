'use strict';

const path = require('path');
const { read } = require('../../core/fs');
const { buildFillPrompt } = require('../../services/prompt.service');
const { CommandError } = require('../../core/errors');

const TEMPLATES_PROMPTS_DIR = path.resolve(__dirname, '../../../templates/prompts');
const KNOWN_PROMPTS = ['fill', 'update'];

/**
 * Handles the `contextforge prompt` CLI command.
 * @throws {CommandError} when an unknown prompt name is requested.
 */
function handlePrompt(context) {
  const { root, args, flags } = context;
  const promptName = args[0] || 'fill';

  if (promptName === 'fill') {
    const brief = buildFillPrompt(root, { compact: flags.has('--compact') });
    console.log(brief);
    return;
  }

  const promptFile = path.join(TEMPLATES_PROMPTS_DIR, `${promptName}.md`);
  const template = read(promptFile);

  if (!template) {
    throw new CommandError(`unknown prompt "${promptName}" — use: prompt ${KNOWN_PROMPTS.join('|')} [--compact]`, 1);
  }

  console.log(template);
}

module.exports = {
  handlePrompt
};
