'use strict';

const fs = require('fs');
const { getSessionContext, getStopNudge, getEditContext } = require('../../services/agenthook.service');
const { CommandError } = require('../../core/errors');

/**
 * Hook input arrives as JSON on stdin. A missing, interactive or malformed stdin
 * means "no input" — a hook must never break the agent's session.
 *
 * @returns {Record<string, any>}
 */
function readHookInput() {
  if (process.stdin.isTTY) {
    return {};
  }
  try {
    const text = fs.readFileSync(0, 'utf8');
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

/**
 * Handles `repocanon agent-hook <session-start|stop|pre-edit>`, called by agent hooks
 * (e.g. the Claude Code plugin). Always exits 0.
 */
function handleAgentHook(context) {
  const { root, args } = context;
  const event = args[0];

  if (event === 'session-start') {
    const text = getSessionContext(root);
    if (text) console.log(text);
    return;
  }
  if (event === 'stop') {
    const nudge = getStopNudge(root, readHookInput());
    if (nudge) console.log(JSON.stringify(nudge));
    return;
  }
  if (event === 'pre-edit') {
    // PreToolUse: plain stdout never reaches the model, additionalContext does
    const text = getEditContext(root, readHookInput());
    if (text) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } }));
    return;
  }
  throw new CommandError('usage: repocanon agent-hook <session-start|stop|pre-edit>', 1);
}

module.exports = {
  handleAgentHook
};
