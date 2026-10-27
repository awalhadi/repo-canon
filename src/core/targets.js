'use strict';

const path = require('path');
const { exists } = require('./fs');
const {
  IDE_POINTER_TEXT,
  CLAUDE_POINTER_TEXT,
  CURSOR_RULE_PATH,
  CURSOR_RULE_FRONTMATTER
} = require('./constants');

/**
 * AI tools RepoCanon can point at the knowledge layer. Data only — adding a tool
 * is one entry here. AGENTS.md is always written and is not a target.
 *
 * - `file`    instruction file holding the managed block (null = reads AGENTS.md natively)
 * - `text`    managed-block body; `prefix` is written once when the file is created
 * - `detect`  paths whose presence means the project already uses this tool
 *             (a trailing "/" marks a directory)
 * - `aliases` extra names accepted by --targets
 * Reserved for `repocanon setup` (roadmap P1.5): `mcp` — the tool's MCP config path and shape.
 */
const TARGETS = [
  {
    id: 'claude',
    label: 'Claude Code',
    aliases: ['claude-code', 'claudecode', 'cloude'],
    file: 'CLAUDE.md',
    text: CLAUDE_POINTER_TEXT,
    detect: ['CLAUDE.md', '.claude/']
  },
  {
    id: 'cursor',
    label: 'Cursor',
    aliases: [],
    file: CURSOR_RULE_PATH,
    text: IDE_POINTER_TEXT,
    prefix: CURSOR_RULE_FRONTMATTER,
    detect: ['.cursor/', '.cursorrules']
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    aliases: ['github', 'github-copilot', 'vscode'],
    file: '.github/copilot-instructions.md',
    text: IDE_POINTER_TEXT,
    detect: ['.github/copilot-instructions.md', '.github/instructions/']
  },
  {
    id: 'gemini',
    label: 'Gemini CLI / Antigravity',
    aliases: ['gemini-cli', 'antigravity'],
    file: 'GEMINI.md',
    text: IDE_POINTER_TEXT,
    detect: ['GEMINI.md', '.gemini/']
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    aliases: [],
    file: '.windsurfrules',
    text: IDE_POINTER_TEXT,
    detect: ['.windsurfrules', '.windsurf/']
  },
  {
    id: 'cline',
    label: 'Cline',
    aliases: [],
    file: '.clinerules',
    text: IDE_POINTER_TEXT,
    detect: ['.clinerules']
  },
  {
    id: 'codex',
    label: 'OpenAI Codex / ChatGPT',
    aliases: ['openai', 'chatgpt', 'gpt'],
    file: null,
    native: true,
    detect: ['.codex/']
  }
];

const TARGET_IDS = TARGETS.map(t => t.id);

/**
 * Looks up a target by id.
 *
 * @param {string} id
 * @returns {typeof TARGETS[number] | undefined}
 */
function getTarget(id) {
  return TARGETS.find(t => t.id === id);
}

/**
 * Turns user input (ids, aliases, "all", "none") into canonical target ids,
 * in registry order and without duplicates. Never throws.
 *
 * @param {string[]|string} input - list, or a comma-separated string
 * @returns {{ ids: string[], unknown: string[] }}
 */
function resolveTargetIds(input) {
  const names = (Array.isArray(input) ? input : String(input || '').split(','))
    .map(n => String(n).trim().toLowerCase())
    .filter(Boolean);
  const chosen = new Set();
  const unknown = [];

  for (const name of names) {
    if (name === 'all') {
      TARGET_IDS.forEach(id => chosen.add(id));
    } else if (name !== 'none') {
      const target = TARGETS.find(t => t.id === name || t.aliases.includes(name));
      if (target) {
        chosen.add(target.id);
      } else {
        unknown.push(name);
      }
    }
  }

  return { ids: TARGET_IDS.filter(id => chosen.has(id)), unknown };
}

/**
 * Tools the project already shows signs of using.
 *
 * @param {string} root - Project root directory
 * @returns {Array<{ id: string, evidence: string }>}
 */
function detectTargets(root) {
  const found = [];
  for (const target of TARGETS) {
    const evidence = target.detect.find(p => exists(path.join(root, p)));
    if (evidence) {
      found.push({ id: target.id, evidence });
    }
  }
  return found;
}

module.exports = {
  TARGETS,
  TARGET_IDS,
  getTarget,
  resolveTargetIds,
  detectTargets
};
