'use strict';

/**
 * The three conditions an agent runs under. Each gets the same fixture and task;
 * only the project knowledge differs.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { FIXTURES_DIR, BENCH_DIR } = require('./tasks');

const CLI = path.resolve(BENCH_DIR, '..', 'bin', 'repocanon.js');
/**
 * none               the fixture alone
 * agents-md          a hand-written AGENTS.md (imported by CLAUDE.md)
 * repocanon-pointer  RepoCanon with "entryDigest": false: AGENTS.md points to .ai/ (0.5 design)
 * repocanon          RepoCanon 0.6: AGENTS.md also carries the rules digest
 * repocanon-hooks    RepoCanon 0.7 as the Claude Code plugin ships it: the above plus the
 *                    session, edit-time and end-of-turn hooks, and claim anchors
 */
const CONDITIONS = ['none', 'agents-md', 'repocanon-pointer', 'repocanon', 'repocanon-hooks'];

/** What each suite runs when --conditions is not given. */
const SUITE_CONDITIONS = {
  core: ['none', 'agents-md', 'repocanon-pointer', 'repocanon'],
  drift: ['agents-md', 'repocanon', 'repocanon-hooks']
};

const PLUGIN_HOOKS = path.resolve(BENCH_DIR, '..', 'plugins', 'repocanon', 'hooks', 'hooks.json');
const ANNOTATION = /\s*<!--\s*rc:.*?-->/g;

const git = (cwd, ...args) => cp.execFileSync('git', ['-c', 'user.email=bench@repocanon.dev', '-c', 'user.name=bench', ...args], { cwd, stdio: 'pipe' });
const repocanon = (cwd, ...args) => cp.execFileSync('node', [CLI, ...args], { cwd, stdio: 'pipe', encoding: 'utf8' });

/**
 * The plugin's hooks as project settings, running this checkout's CLI instead of npx.
 *
 * @returns {object}
 */
function getPluginHookSettings() {
  const { hooks } = JSON.parse(fs.readFileSync(PLUGIN_HOOKS, 'utf8'));
  const quoted = `'${CLI.replace(/'/g, "'\\''")}'`;
  const rewrite = command => command.replace(/npx -y '[^']+'/g, `node ${quoted}`);
  for (const groups of Object.values(hooks)) {
    for (const group of groups) for (const hook of group.hooks) hook.command = rewrite(hook.command);
  }
  return { hooks };
}

/**
 * Removes claim annotations from every .ai/ doc: conditions before 0.7 get the same
 * facts without them.
 *
 * @param {string} aiDir
 */
function stripAnnotations(aiDir) {
  for (const rel of fs.readdirSync(aiDir, { recursive: true }).map(String).filter(f => f.endsWith('.md'))) {
    const file = path.join(aiDir, rel);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(ANNOTATION, ''));
  }
}

/**
 * Adds the condition's knowledge to a prepared fixture repo and commits it.
 *
 * @param {string} condition - one of CONDITIONS
 * @param {string} repoDir
 * @param {{ fixture: string }} task
 * @returns {{ mcpConfig: object|null }} MCP servers the agent gets (only repocanon has one)
 */
function applyCondition(condition, repoDir, task) {
  const knowledge = path.join(FIXTURES_DIR, task.fixture, 'knowledge');
  // A drift task may adjust the shared knowledge, e.g. tie its rule to the code it describes
  const overrides = task.dir ? path.join(task.dir, 'knowledge') : null;
  const overrideFile = rel => overrides && fs.existsSync(path.join(overrides, rel)) ? path.join(overrides, rel) : null;
  if (condition === 'none') {
    return { mcpConfig: null };
  }
  if (condition === 'agents-md') {
    fs.copyFileSync(overrideFile('AGENTS.md') || path.join(knowledge, 'AGENTS.md'), path.join(repoDir, 'AGENTS.md'));
    // Claude Code reads CLAUDE.md, not AGENTS.md: the same import RepoCanon writes
    fs.writeFileSync(path.join(repoDir, 'CLAUDE.md'), '@AGENTS.md\n');
    git(repoDir, 'add', '-A');
    git(repoDir, 'commit', '-qm', 'AGENTS.md');
    return { mcpConfig: null };
  }
  if (condition === 'repocanon' || condition === 'repocanon-pointer' || condition === 'repocanon-hooks') {
    fs.cpSync(path.join(knowledge, 'ai'), path.join(repoDir, '.ai'), { recursive: true });
    if (overrideFile('ai')) fs.cpSync(overrideFile('ai'), path.join(repoDir, '.ai'), { recursive: true, force: true });
    if (condition !== 'repocanon-hooks') stripAnnotations(path.join(repoDir, '.ai'));
    if (condition === 'repocanon-hooks') {
      fs.mkdirSync(path.join(repoDir, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(repoDir, '.claude', 'settings.json'), `${JSON.stringify(getPluginHookSettings(), null, 2)}\n`);
    }
    if (condition === 'repocanon-pointer') {
      fs.writeFileSync(path.join(repoDir, '.repocanon.json'), `${JSON.stringify({ preset: 'auto', entryDigest: false }, null, 2)}\n`);
    }
    repocanon(repoDir, 'init', '--targets=claude', '--yes');
    repocanon(repoDir, 'analyze');
    repocanon(repoDir, 'skills');
    git(repoDir, 'add', '-A');
    git(repoDir, 'commit', '-qm', 'repocanon');
    repocanon(repoDir, 'stamp', '--all');
    git(repoDir, 'add', '-A');
    git(repoDir, 'commit', '-qm', 'stamp');
    return {
      mcpConfig: { mcpServers: { repocanon: { command: 'node', args: [CLI, 'mcp', `--root=${repoDir}`] } } }
    };
  }
  throw new Error(`unknown condition ${condition}`);
}

module.exports = { CONDITIONS, SUITE_CONDITIONS, applyCondition, getPluginHookSettings, CLI };
