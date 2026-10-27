'use strict';

const fs = require('fs');
const path = require('path');
const { exists, read } = require('../core/fs');
const { parseFrontmatter } = require('../core/frontmatter');
const { estimateTokens, estimateRepoTokens } = require('../core/tokens');
const { loadConfig, validateConfig } = require('../core/config');
const { readManagedBlock } = require('../core/blocks');
const { TARGETS } = require('../core/targets');
const { scanKnowledgeLayer, INFERABLE_LABELS } = require('./inferable.service');
const { scanSecrets, formatSecretFinding } = require('./secrets.service');
const { planRules, getPendingRules } = require('./rules.service');

const MAX_INFERABLE_PER_DOC = 5;
const {
  DOC_LINE_CAPS,
  MODULE_DOC_LINE_CAP,
  ENTRY_TOKEN_TARGET,
  ENTRY_TOKEN_WARN
} = require('../core/constants');

/**
 * Lints the knowledge layer for structural integrity, size caps, broken links, and token budgeting.
 *
 * @param {string} root - Project root directory
 * @returns {{
 *   findings: Array<{ level: 'error'|'warn'|'info', msg: string }>,
 *   docs: Array<{ rel: string, lines: number, tokens: number, todos: number }>,
 *   budget: { entryTokens: number, repoTokens: number, ratio: number|null, estimate: string } | null
 * }}
 */
function runDoctor(root) {
  const findings = [];
  const docs = [];
  const addFinding = (level, msg) => findings.push({ level, msg });

  if (!exists(path.join(root, '.ai'))) {
    addFinding('error', '.ai/ missing — run: repocanon init');
    return { findings, docs, budget: null };
  }

  const agentsPath = path.join(root, 'AGENTS.md');
  const agentsContent = read(agentsPath);
  if (agentsContent === null) {
    addFinding('error', 'AGENTS.md missing — run: repocanon init');
  } else if (!/\.ai\//.test(agentsContent)) {
    addFinding('error', 'AGENTS.md does not reference .ai/ — run: repocanon init');
  }

  // Only the tools the project chose; no saved choice yet = legacy, every tool
  const config = loadConfig(root);
  const chosen = Array.isArray(config.targets) ? config.targets : TARGETS.map(t => t.id);
  for (const target of TARGETS.filter(t => t.file && chosen.includes(t.id))) {
    const pointerContent = read(path.join(root, target.file));
    if (pointerContent === null) {
      addFinding('warn', `${target.file} missing (${target.label} will not find .ai/) — run: repocanon init`);
    } else if (readManagedBlock(path.join(root, target.file)) === null || !/AGENTS\.md/.test(pointerContent)) {
      addFinding('warn', `${target.file}: RepoCanon block missing (${target.label} will not find AGENTS.md) — run: repocanon init`);
    }
  }

  let totalTodos = 0;
  const inspectDoc = (relPath, lineCap) => {
    const fullPath = path.join(root, relPath);
    const content = read(fullPath);
    if (content === null) {
      return null;
    }
    const lines = content.split('\n').length;
    const todos = (content.match(/TODO/g) || []).length;
    totalTodos += todos;

    docs.push({
      rel: relPath,
      lines,
      tokens: estimateTokens(content),
      todos
    });

    if (lines > lineCap) {
      addFinding('warn', `${relPath}: ${lines} lines (cap ${lineCap}) — trim or split`);
    }
    return content;
  };

  for (const [relPath, lineCap] of DOC_LINE_CAPS) {
    inspectDoc(relPath, lineCap);
  }

  const modulesDir = path.join(root, '.ai', 'modules');
  if (fs.existsSync(modulesDir)) {
    let moduleFiles = [];
    try {
      moduleFiles = fs.readdirSync(modulesDir);
    } catch {
      // Ignore read error
    }

    for (const fileName of moduleFiles) {
      if (!fileName.endsWith('.md') || fileName.startsWith('_')) {
        continue;
      }
      const relPath = `.ai/modules/${fileName}`;
      const content = inspectDoc(relPath, MODULE_DOC_LINE_CAP);
      const fm = parseFrontmatter(content);

      if (!fm.module) {
        addFinding('warn', `${relPath}: frontmatter 'module' missing`);
      }

      if (!Array.isArray(fm.code_paths) || !fm.code_paths.length) {
        addFinding('warn', `${relPath}: code_paths empty — sync cannot track it`);
      } else {
        for (const codePath of fm.code_paths) {
          if (!exists(path.join(root, codePath))) {
            addFinding('error', `${relPath}: code path not found: ${codePath}`);
          }
        }
      }

      if (!fm.verified_at) {
        addFinding('info', `${relPath}: not verified yet (run: repocanon stamp ${fileName.slice(0, -3)})`);
      }
    }
  }

  if (totalTodos > 0) {
    addFinding('info', `${totalTodos} TODO placeholder(s) remain in .ai/ — run: repocanon prompt fill`);
  }

  // Docs are committed and often published: a pasted key here is a leak
  for (const { doc, findings: secretFindings } of scanSecrets(root)) {
    for (const item of secretFindings) {
      addFinding('error', formatSecretFinding(doc, item));
    }
  }

  const pendingRules = getPendingRules(planRules(root));
  if (pendingRules.length) {
    addFinding('warn', `scoped rule files are out of date (${pendingRules.length}: ${pendingRules.slice(0, 3).map(r => r.file).join(', ')}${pendingRules.length > 3 ? ', …' : ''}) — run: npx repocanon rules`);
  }

  // Content agents can learn from the code itself costs tokens on every task without helping
  let inferableTokens = 0;
  for (const { doc, findings: docFindings } of scanKnowledgeLayer(root)) {
    for (const item of docFindings.slice(0, MAX_INFERABLE_PER_DOC)) {
      addFinding('warn', `${doc}:${item.line} ${INFERABLE_LABELS[item.kind]} (~${item.tokens} tokens) — ${item.hint}`);
    }
    if (docFindings.length > MAX_INFERABLE_PER_DOC) {
      addFinding('warn', `${doc}: +${docFindings.length - MAX_INFERABLE_PER_DOC} more inferable block(s)`);
    }
    inferableTokens += docFindings.reduce((sum, item) => sum + item.tokens, 0);
  }
  if (inferableTokens > 0) {
    addFinding('info', `~${inferableTokens} tokens in .ai/ describe what agents can read from the code — delete them`);
  }

  for (const configError of validateConfig(config)) {
    addFinding('warn', `config: ${configError}`);
  }

  const getTokensForDoc = relPath => (docs.find(d => d.rel === relPath) || { tokens: 0 }).tokens;
  const entryTokens =
    getTokensForDoc('AGENTS.md') +
    getTokensForDoc('.ai/PROJECT.md') +
    getTokensForDoc('.ai/INDEX.md');

  const repoTokensCount = estimateRepoTokens(root);
  if (entryTokens > ENTRY_TOKEN_WARN) {
    addFinding('warn', `entry context is ~${entryTokens} tokens (AGENTS+PROJECT+INDEX, target ≤${ENTRY_TOKEN_TARGET}) — cut what agents can infer from code`);
  } else if (entryTokens > ENTRY_TOKEN_TARGET) {
    addFinding('info', `entry context is ~${entryTokens} tokens (target ≤${ENTRY_TOKEN_TARGET}) — keep only commands, rules and boundaries`);
  }

  return {
    findings,
    docs,
    budget: {
      entryTokens,
      repoTokens: repoTokensCount,
      ratio: repoTokensCount ? +(entryTokens / repoTokensCount * 100).toFixed(2) : null,
      estimate: 'entry: word-aware heuristic; repo: bytes/4 — approximate'
    }
  };
}

module.exports = {
  runDoctor,
  doctor: runDoctor,
  repoTokens: estimateRepoTokens
};
