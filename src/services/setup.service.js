'use strict';

const path = require('path');
const { read, write } = require('../core/fs');
const { TARGETS } = require('../core/targets');

const SERVER_NAME = 'repocanon';
const BASE_ARGS = ['-y', 'repocanon', 'mcp'];

/**
 * The MCP server entry for one tool. Project configs use the tool's own variable for
 * the project folder when it has one; global configs get the absolute path, because
 * a global server would otherwise start outside the project.
 *
 * @param {{ scope: string, rootArg?: string, type?: string }} mcp
 * @param {string} root - absolute project root
 * @returns {Record<string, any>}
 */
function buildServerEntry(mcp, root) {
  const rootArg = mcp.scope === 'global' ? path.resolve(root) : mcp.rootArg;
  const entry = {};
  if (mcp.type) entry.type = mcp.type;
  entry.command = 'npx';
  entry.args = rootArg ? [...BASE_ARGS, `--root=${rootArg}`] : [...BASE_ARGS];
  return entry;
}

/**
 * Copy-paste text for a tool whose config RepoCanon doesn't write itself.
 *
 * @param {{ key: string, format: string }} mcp
 * @param {Record<string, any>} entry
 * @returns {string}
 */
function buildSnippet(mcp, entry) {
  if (mcp.format === 'toml') {
    const args = entry.args.map(a => JSON.stringify(a)).join(', ');
    return `[${mcp.key}.${SERVER_NAME}]\ncommand = "${entry.command}"\nargs = [${args}]`;
  }
  return JSON.stringify({ [mcp.key]: { [SERVER_NAME]: entry } }, null, 2);
}

/**
 * Previews what `setup` would change for each tool, without writing.
 *
 * Actions: create (new file) | add (file exists, no repocanon entry) | update (entry differs)
 * | unchanged | invalid (file isn't plain JSON — left untouched) | manual (global config: snippet only)
 * | none (tool has no MCP config).
 *
 * @param {string} root - Project root directory
 * @param {string[]} ids - target ids
 * @returns {Array<{ id: string, label: string, file: string, action: string, entry?: object, snippet?: string, error?: string }>}
 */
function planSetup(root, ids) {
  return TARGETS.filter(t => ids.includes(t.id)).map(target => {
    const { mcp } = target;
    const base = { id: target.id, label: target.label, file: mcp ? mcp.file : '' };
    if (!mcp) {
      return { ...base, action: 'none' };
    }

    const entry = buildServerEntry(mcp, root);
    const snippet = buildSnippet(mcp, entry);
    if (mcp.scope === 'global') {
      return { ...base, action: 'manual', entry, snippet };
    }

    const text = read(path.join(root, mcp.file));
    if (text === null) {
      return { ...base, action: 'create', entry, snippet };
    }

    let config;
    try {
      config = JSON.parse(text);
    } catch (error) {
      return { ...base, action: 'invalid', entry, snippet, error: `not plain JSON (${error.message})` };
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { ...base, action: 'invalid', entry, snippet, error: 'top level is not a JSON object' };
    }

    const current = config[mcp.key] && config[mcp.key][SERVER_NAME];
    if (!current) {
      return { ...base, action: 'add', entry, snippet };
    }
    return { ...base, action: JSON.stringify(current) === JSON.stringify(entry) ? 'unchanged' : 'update', entry, snippet };
  });
}

/**
 * Writes the planned entries. Only the `repocanon` server key is touched; every other
 * server, setting and key order in the file stays as it was.
 *
 * @param {string} root - Project root directory
 * @param {ReturnType<typeof planSetup>} plan
 * @returns {ReturnType<typeof planSetup>} the same rows, for reporting
 */
function applySetup(root, plan) {
  for (const row of plan) {
    if (!['create', 'add', 'update'].includes(row.action)) continue;
    const { mcp } = TARGETS.find(t => t.id === row.id);
    const fullPath = path.join(root, mcp.file);
    const config = row.action === 'create' ? {} : JSON.parse(read(fullPath));
    config[mcp.key] = { ...(config[mcp.key] || {}), [SERVER_NAME]: row.entry };
    write(fullPath, `${JSON.stringify(config, null, 2)}\n`);
  }
  return plan;
}

module.exports = {
  planSetup,
  applySetup,
  buildServerEntry
};
