'use strict';

const pkg = require('../../package.json');
const { TARGET_IDS } = require('../core/targets');

const DOCS_URL = 'https://github.com/awalhadi/repo-canon#readme';

const GROUPS = [
  ['start', 'Start'],
  ['daily', 'Every day'],
  ['agents', 'For your AI agents'],
  ['ci', 'CI and teams']
];

/**
 * Every command, with what a beginner needs to use it and an expert needs to script it.
 * `flags` and `examples` are [text, description] pairs.
 */
const COMMANDS = [
  {
    name: 'init', group: 'start', summary: 'Create AGENTS.md and the .ai/ docs, and point your AI tools at them',
    usage: 'repocanon init [--targets=a,b|all|none] [--yes] [--prune] [--force]',
    flags: [
      ['--targets=a,b', `tools to set up: ${TARGET_IDS.join(', ')}, all or none`],
      ['--yes', 'skip the picker and use the detected or saved tools'],
      ['--prune', 'remove RepoCanon blocks from tools you deselected'],
      ['--force', 'rewrite core docs from the templates (your edits are lost)']
    ],
    examples: [
      ['npx repocanon init', 'pick your tools in a menu'],
      ['npx repocanon init --targets=claude,cursor', 'no menu, for scripts']
    ]
  },
  {
    name: 'adopt', group: 'start', summary: 'Import CLAUDE.md, Cursor/Copilot rules, GEMINI.md or a Cline memory bank into .ai/',
    usage: 'repocanon adopt [--dry-run] [--move] [--json]',
    flags: [
      ['--dry-run', 'show what would be imported, write nothing'],
      ['--move', 'after committing: turn the originals into pointers']
    ],
    examples: [['npx repocanon adopt --dry-run', 'preview the import'], ['npx repocanon adopt', 'import']]
  },
  {
    name: 'setup', group: 'start', summary: 'Register the RepoCanon MCP server in your tools\' configs',
    usage: 'repocanon setup [tool…|all] [--json]',
    flags: [['tool…', 'tools to configure (default: the tools init set up)']],
    examples: [['npx repocanon setup', 'configure the tools you chose'], ['npx repocanon setup cursor', 'just Cursor']]
  },
  {
    name: 'status', group: 'daily', summary: 'Which docs still match the code (fresh, stale, broken, unverified)',
    usage: 'repocanon status [--ci] [--json]',
    flags: [['--ci', 'exit 1 when a doc is stale or broken'], ['--json', '{ docs, score } for scripts']],
    examples: [['npx repocanon status', 'see doc freshness']]
  },
  {
    name: 'sync', group: 'daily', summary: 'What changed in the code since each doc was verified',
    usage: 'repocanon sync [--write] [--since=ref] [--json]',
    flags: [['--write', 'also save the report to .ai/.sync-report.md'], ['--since=ref', 'compare with a git ref instead']],
    examples: [['npx repocanon sync', 'list docs to update and the files to read']]
  },
  {
    name: 'stamp', group: 'daily', summary: 'Mark docs verified at the current commit after you re-checked them',
    usage: 'repocanon stamp <doc…> | --all [--force]',
    flags: [['--all', 'every doc'], ['--force', 'stamp even if their code has uncommitted changes']],
    examples: [['npx repocanon stamp billing', 'after updating .ai/modules/billing.md'], ['npx repocanon stamp CONVENTIONS', 'a core doc']]
  },
  {
    name: 'claims', group: 'daily', summary: 'Rules tied to code or tests: enforced, anchored, stale or broken',
    usage: 'repocanon claims [--ci] [--json]',
    flags: [['--ci', 'exit 1 on stale claims too, not just broken ones']],
    examples: [['npx repocanon claims', 'which rules still match the code']]
  },
  {
    name: 'doctor', group: 'daily', summary: 'Check the docs: broken paths, secrets, size, stale rules, token budget',
    usage: 'repocanon doctor [--ci] [--strict] [--format=github] [--json]',
    flags: [
      ['--ci', 'exit 1 on errors'],
      ['--strict', 'with --ci, warnings fail too'],
      ['--format=github', 'GitHub Actions annotations (automatic in Actions with --ci)']
    ],
    examples: [['npx repocanon doctor', 'check everything'], ['npx repocanon doctor --ci --strict', 'in CI']]
  },
  {
    name: 'context', group: 'agents', summary: 'Print a budgeted context pack for a task',
    usage: 'repocanon context [words…] [--files=a,b] [--max=4000]',
    flags: [['--files=a,b', 'files you will touch'], ['--max=4000', 'token budget']],
    examples: [['npx repocanon context "add refunds" | pbcopy', 'paste into any chat']]
  },
  {
    name: 'prompt', group: 'agents', summary: 'Briefs to paste into your agent: fill the docs, or update them',
    usage: 'repocanon prompt <fill|update> [--compact]',
    flags: [['--compact', 'short form of the fill brief']],
    examples: [['npx repocanon prompt fill', 'first fill of the .ai/ docs']]
  },
  {
    name: 'rules', group: 'agents', summary: 'Per-module rule files tools load only while editing that module, plus the AGENTS.md digest',
    usage: 'repocanon rules [--check] [--json]',
    flags: [['--check', 'write nothing; exit 1 if anything is out of date']],
    examples: [['npx repocanon rules', 'regenerate after editing .ai/ docs']]
  },
  {
    name: 'skills', group: 'agents', summary: 'Generate the verify-a-change skill and copy .ai/skills to each tool',
    usage: 'repocanon skills [--check] [--json]',
    flags: [['--check', 'write nothing; exit 1 if anything is out of date']],
    examples: [['npx repocanon skills', 'write .claude/skills and .agents/skills']]
  },
  {
    name: 'analyze', group: 'agents', summary: 'Refresh the module map in .ai/INDEX.md',
    usage: 'repocanon analyze [--scaffold]',
    flags: [['--scaffold', 'also create a doc stub for every module without one']],
    examples: [['npx repocanon analyze --scaffold', 'start module docs']]
  },
  {
    name: 'mcp', group: 'agents', summary: 'Run the MCP server on stdio (your tool starts this, not you)',
    usage: 'repocanon mcp [--root=dir]',
    flags: [['--root=dir', 'project to serve (for global tool configs)']],
    examples: [['npx repocanon setup', 'configures this for you']]
  },
  {
    name: 'report', group: 'ci', summary: 'Pull-request summary: modules changed with or without their docs',
    usage: 'repocanon report [--base=ref] [--format=markdown|json]',
    flags: [['--base=ref', 'branch the PR targets (default origin/main or main)']],
    examples: [['npx repocanon report --base=main', 'what the PR comment would say']]
  },
  {
    name: 'hook', group: 'ci', summary: 'Install the pre-commit hook: blocks secrets, warns on undocumented changes',
    usage: 'repocanon hook',
    flags: [],
    examples: [['npx repocanon hook', 'install or upgrade it']]
  },
  {
    name: 'secrets', group: 'ci', summary: 'Find API keys, passwords and unsafe instructions in agent docs',
    usage: 'repocanon secrets [--staged] [--json] [--quiet]',
    flags: [['--staged', 'scan what the next commit would publish'], ['--quiet', 'exit code only']],
    examples: [['npx repocanon secrets', 'scan the docs']]
  },
  {
    name: 'agent-hook', group: 'hidden', summary: 'Output for agent hooks (used by the Claude Code plugin)',
    usage: 'repocanon agent-hook <session-start|stop|pre-edit>', flags: [], examples: []
  }
];

const GLOBAL_FLAGS = [
  ['--root=dir', 'run against another directory'],
  ['--no-color', 'plain output (also: NO_COLOR=1)'],
  ['--debug', 'show the stack trace on errors'],
  ['--version', 'print the version']
];

/**
 * @param {string} name
 * @returns {typeof COMMANDS[number] | undefined}
 */
function findCommand(name) {
  return COMMANDS.find(command => command.name === name);
}

/**
 * The closest command name, for "did you mean". Levenshtein distance ≤ 2.
 *
 * @param {string} input
 * @returns {string|null}
 */
function suggestCommand(input) {
  const distance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const current = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = current;
      }
    }
    return row[b.length];
  };
  const best = COMMANDS
    .filter(command => command.group !== 'hidden')
    .map(command => [command.name, distance(String(input).toLowerCase(), command.name)])
    .sort((a, b) => a[1] - b[1])[0];
  return best && best[1] <= 2 ? best[0] : null;
}

/**
 * `repocanon` with no command, or --help.
 *
 * @param {ReturnType<typeof import('./ui').createUi>} ui
 */
function printOverview(ui) {
  const { c } = ui;
  ui.line(`${c.cyan(ui.glyph.mark)} ${c.bold('repocanon')} ${c.dim(pkg.version)}  ${c.dim('verified AGENTS.md and project memory for AI coding agents')}`);
  ui.line('');
  ui.line(`${c.bold('Usage')}  repocanon ${c.cyan('<command>')} [options]`);
  for (const [group, title] of GROUPS) {
    ui.section(title);
    ui.table(COMMANDS.filter(command => command.group === group).map(command => [c.cyan(command.name), command.summary]));
  }
  ui.section('Global options');
  ui.table(GLOBAL_FLAGS);
  ui.line('');
  ui.line(`${c.dim('New here?')} ${c.cyan('npx repocanon init')}${c.dim(' · details for one command:')} ${c.cyan('repocanon <command> --help')}`);
  ui.line(c.dim(`Docs: ${DOCS_URL}`));
}

/**
 * `repocanon <command> --help`.
 *
 * @param {ReturnType<typeof import('./ui').createUi>} ui
 * @param {typeof COMMANDS[number]} command
 */
function printCommandHelp(ui, command) {
  const { c } = ui;
  ui.line(`${c.cyan(ui.glyph.mark)} ${c.bold(`repocanon ${command.name}`)}  ${c.dim(command.summary)}`);
  ui.line('');
  ui.line(`${c.bold('Usage')}  ${command.usage}`);
  if (command.flags.length) {
    ui.section('Options');
    ui.table(command.flags);
  }
  if (command.examples.length) {
    ui.section('Examples');
    ui.table(command.examples.map(([cmd, why]) => [c.cyan(cmd), c.dim(why)]));
  }
  ui.line('');
  ui.line(c.dim(`Global options: ${GLOBAL_FLAGS.map(([flag]) => flag).join(' ')} · Docs: ${DOCS_URL}`));
}

module.exports = { COMMANDS, findCommand, suggestCommand, printOverview, printCommandHelp, DOCS_URL };
