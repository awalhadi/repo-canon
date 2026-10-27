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
const CONDITIONS = ['none', 'agents-md', 'repocanon'];

const git = (cwd, ...args) => cp.execFileSync('git', ['-c', 'user.email=bench@repocanon.dev', '-c', 'user.name=bench', ...args], { cwd, stdio: 'pipe' });
const repocanon = (cwd, ...args) => cp.execFileSync('node', [CLI, ...args], { cwd, stdio: 'pipe', encoding: 'utf8' });

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
  if (condition === 'none') {
    return { mcpConfig: null };
  }
  if (condition === 'agents-md') {
    fs.copyFileSync(path.join(knowledge, 'AGENTS.md'), path.join(repoDir, 'AGENTS.md'));
    // Claude Code reads CLAUDE.md, not AGENTS.md: the same import RepoCanon writes
    fs.writeFileSync(path.join(repoDir, 'CLAUDE.md'), '@AGENTS.md\n');
    git(repoDir, 'add', '-A');
    git(repoDir, 'commit', '-qm', 'AGENTS.md');
    return { mcpConfig: null };
  }
  if (condition === 'repocanon') {
    fs.cpSync(path.join(knowledge, 'ai'), path.join(repoDir, '.ai'), { recursive: true });
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

module.exports = { CONDITIONS, applyCondition, CLI };
