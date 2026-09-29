'use strict';

// Static architecture guardrails. These tests read source, not behaviour — they exist so a
// layering violation (or a dead file creeping back in) fails CI instead of surviving code review.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function localRequires(file) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    out.push(path.normalize(path.join(path.dirname(file), m[1])));
  }
  return out;
}

const layer = f => {
  const rel = path.relative(SRC, f);
  if (rel.startsWith('core' + path.sep)) return 'core';
  if (rel.startsWith('services' + path.sep)) return 'services';
  if (rel.startsWith('cli' + path.sep)) return 'cli';
  if (rel.startsWith('mcp' + path.sep)) return 'mcp';
  if (rel === 'index.js') return 'index';
  return 'other';
};

// index.js is the public facade and is allowed to depend on every layer; every other layer's
// allowed lower layers are listed explicitly — anything not listed is a violation.
const ALLOWED = {
  core: new Set(['core']),
  services: new Set(['core', 'services']),
  // cli is the outermost layer: it wires up every inner layer, including launching the MCP
  // server as one of its own subcommands (`contextforge mcp`) — cli -> mcp is intended, not a leak.
  cli: new Set(['core', 'services', 'cli', 'mcp']),
  mcp: new Set(['core', 'services', 'mcp']),
  index: new Set(['core', 'services', 'cli', 'mcp', 'index']),
  other: new Set(['core', 'services', 'cli', 'mcp', 'other'])
};

test('layering: each layer only requires the layers it is allowed to', () => {
  const violations = [];
  for (const file of jsFiles(SRC)) {
    const from = layer(file);
    for (const req of localRequires(file)) {
      const target = req.endsWith('.js') ? req : req + '.js';
      if (!fs.existsSync(target)) continue; // resolves to a directory/index or non-.js — not our concern here
      const to = layer(target);
      if (!ALLOWED[from].has(to)) {
        violations.push(`${path.relative(SRC, file)} (${from}) -> ${path.relative(SRC, target)} (${to})`);
      }
    }
  }
  assert.deepEqual(violations, [], `layering violations:\n${violations.join('\n')}`);
});

test('no flat legacy shim files at src/ root (single source of truth per concern)', () => {
  const rootFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
  assert.deepEqual(rootFiles, ['index.js'], `unexpected file(s) at src/ root: ${rootFiles.filter(f => f !== 'index.js').join(', ')}`);
});

test('no circular requires within src/', () => {
  const graph = new Map();
  for (const file of jsFiles(SRC)) {
    graph.set(file, localRequires(file).map(r => (r.endsWith('.js') ? r : r + '.js')).filter(fs.existsSync));
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...graph.keys()].map(f => [f, WHITE]));
  const stack = [];
  let cycle = null;

  function visit(node) {
    if (cycle) return;
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      if (color.get(next) === GRAY) {
        cycle = [...stack.slice(stack.indexOf(next)), next].map(f => path.relative(SRC, f)).join(' -> ');
        return;
      }
      if (color.get(next) === WHITE) visit(next);
    }
    stack.pop();
    color.set(node, BLACK);
  }
  for (const file of graph.keys()) if (color.get(file) === WHITE) visit(file);

  assert.equal(cycle, null, `circular require: ${cycle}`);
});
