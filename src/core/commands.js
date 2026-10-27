'use strict';

/**
 * Commands a project uses to check a change, read from its own build files and CI.
 * Every parser here is text in, data out: no file access, no YAML dependency.
 */

/** Steps in the order an agent should run them. `check` is an aggregate target (make check). */
const VERIFY_KINDS = ['check', 'format', 'lint', 'typecheck', 'test'];

/**
 * Never suggested to an agent: anything that ships, needs CI secrets, installs,
 * watches forever, or only moves around the shell.
 */
const EXCLUDE = new RegExp([
  '\\$\\{\\{', 'secrets\\.',
  '\\b(deploy|publish|release|upload|push)\\b',
  '\\|\\s*(sudo\\s+)?(sh|bash|zsh)\\b',
  '^(echo|cd|export|mkdir|cp|mv|rm|sudo|apt(-get)?|brew|curl|wget|git|source)\\b', '^\\.\\s',
  '^(\\S+\\s+)?(ci|i|setup|add|init)\\b', '\\binstall\\b',
  '\\bwatch\\b', '--watch', '\\bdev\\b', '\\bserve\\b'
].join('|'), 'i');

const CHECK_NAME = /^(check|verify|validate|qa|pre-?commit)$/;
const RUNNER_TARGET = /^(?:make|just|task|composer|(?:npm|pnpm|yarn|bun)(?:\s+run)?)\s+([\w:./-]+)$/;

const KIND_PATTERNS = [
  ['typecheck', /\b(tsc|mypy|pyright|typecheck|type-check|check-types|types?:check|vue-tsc)\b|\bcargo check\b/i],
  ['format', /\b(prettier|fmt|format|pint|black|gofmt|rustfmt|php-cs-fixer|biome format)\b/i],
  ['lint', /\b(eslint|lint|ruff|phpstan|psalm|clippy|golangci-lint|stylelint|rubocop|flake8|pylint|analyse|analyze|biome)\b|\bgo vet\b/i],
  ['test', /\b(test|tests|jest|vitest|pytest|phpunit|pest|rspec|spec|mocha|ava|playwright|cypress)\b/i]
];

/**
 * Which verification step a command or script name belongs to, or null.
 *
 * @param {string} command - a full command (`pnpm lint`) or a script/target name (`lint`)
 * @returns {'check'|'format'|'lint'|'typecheck'|'test'|null}
 */
function classifyCommand(command) {
  const text = String(command || '').trim();
  if (!text || EXCLUDE.test(text)) return null;
  const target = text.match(RUNNER_TARGET);
  if (CHECK_NAME.test(target ? target[1] : text)) return 'check';
  const kind = KIND_PATTERNS.find(([, re]) => re.test(text));
  return kind ? kind[0] : null;
}

/**
 * Makefile targets, without .PHONY, pattern rules or variable assignments.
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseMakeTargets(text) {
  const targets = [];
  for (const line of String(text || '').split('\n')) {
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9_./-]*)\s*:(?![=:])/);
    if (match && !targets.includes(match[1])) targets.push(match[1]);
  }
  return targets;
}

/**
 * justfile recipe names (top level, not settings, aliases or variables).
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseJustRecipes(text) {
  const recipes = [];
  for (const line of String(text || '').split('\n')) {
    if (/^(set|alias|export|import|mod)\s/.test(line) || line.startsWith('[')) continue;
    const match = line.match(/^@?([A-Za-z0-9_-]+)(\s+[^:=]*)?:(?!=)/);
    if (match && !recipes.includes(match[1])) recipes.push(match[1]);
  }
  return recipes;
}

/**
 * Task names under `tasks:` in a Taskfile.yml.
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseTaskfileTasks(text) {
  const tasks = [];
  let inTasks = false;
  for (const line of String(text || '').split('\n')) {
    if (/^\S/.test(line)) inTasks = /^tasks:\s*$/.test(line);
    const match = inTasks && line.match(/^ {2}["']?([\w:.-]+)["']?:\s*/);
    if (match) tasks.push(match[1]);
  }
  return tasks;
}

/**
 * Commands of a block scalar (`run: |`) or a list, joining `\` continuations.
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
function toCommands(lines) {
  const commands = [];
  let pending = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    pending = pending ? `${pending} ${line}` : line;
    if (pending.endsWith('\\')) {
      pending = pending.slice(0, -1).trim();
      continue;
    }
    commands.push(pending);
    pending = '';
  }
  if (pending) commands.push(pending);
  return commands;
}

const unquote = value => value.trim().replace(/^(['"])(.*)\1$/, '$2');

/**
 * `run:` commands of a GitHub Actions workflow, in file order, with their step name.
 *
 * @param {string} text
 * @returns {Array<{ step: string|null, command: string }>}
 */
function parseWorkflowRuns(text) {
  const lines = String(text || '').split('\n');
  const runs = [];
  let step = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*-\s/.test(line)) {
      const named = line.match(/^\s*-\s+name:\s*(.+)$/);
      step = named ? unquote(named[1]) : null;
    }
    const named = !/^\s*-\s/.test(line) && line.match(/^\s+name:\s*(.+)$/);
    if (named && step === null) step = unquote(named[1]);

    const run = line.match(/^(\s*)(?:-\s+)?run:\s*(.*)$/);
    if (!run) continue;
    const indent = run[1].length;
    const value = run[2].trim();
    if (/^[|>][-+]?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].search(/\S/) > indent)) {
        block.push(lines[++i]);
      }
      runs.push(...toCommands(block).map(command => ({ step, command })));
    } else if (value) {
      runs.push({ step, command: unquote(value) });
    }
  }
  return runs;
}

/**
 * `script:` commands of a .gitlab-ci.yml, with their job name.
 *
 * @param {string} text
 * @returns {Array<{ step: string|null, command: string }>}
 */
function parseGitlabScripts(text) {
  const lines = String(text || '').split('\n');
  const runs = [];
  let job = null;

  for (let i = 0; i < lines.length; i++) {
    const top = lines[i].match(/^([\w.-]+):\s*$/);
    if (top) job = top[1];
    const script = lines[i].match(/^(\s+)script:\s*$/);
    if (!script) continue;
    const indent = script[1].length;
    const items = [];
    while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].search(/\S/) > indent || /^\s*-\s/.test(lines[i + 1]) && lines[i + 1].search(/\S/) >= indent)) {
      const item = lines[++i].match(/^\s*-\s+(.+)$/);
      if (item) items.push(unquote(item[1]));
    }
    runs.push(...items.map(command => ({ step: job, command })));
  }
  return runs;
}

module.exports = {
  VERIFY_KINDS,
  classifyCommand,
  parseMakeTargets,
  parseJustRecipes,
  parseTaskfileTasks,
  parseWorkflowRuns,
  parseGitlabScripts
};
