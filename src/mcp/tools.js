'use strict';

const path = require('path');
const { read, toSlug, isPathInside } = require('../core/fs');
const { packContext, getModuleMap } = require('../services/pack.service');
const { getDocStatus } = require('../services/status.service');
const { buildFillPrompt } = require('../services/prompt.service');
const { syncProject, formatSyncReport } = require('../services/sync.service');

const MCP_TOOLS = [
  {
    name: 'rc_context',
    description:
      'Budgeted context pack for a task: PROJECT + relevant module docs + DOMAIN/CONVENTIONS/STATE. Call this FIRST instead of scanning the repo.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'task description / keywords' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'repo-relative files you expect to touch'
        },
        max_tokens: { type: 'number' }
      }
    }
  },
  {
    name: 'rc_module',
    description: 'Full knowledge doc for one module (purpose, invariants, flow, code map).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    }
  },
  {
    name: 'rc_find_owner',
    description: 'Which module owns a repo-relative file path, and its doc.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path']
    }
  },
  {
    name: 'rc_status',
    description: 'Freshness of every .ai doc (fresh/stale/broken/unverified) vs git.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'rc_prepare_fill',
    description:
      'Evidence-loaded brief for writing/filling the .ai/ knowledge docs (stack playbook, files to inspect, per-doc instructions). Call this, then write the .ai/*.md files yourself with your own file tools — do not ask the human to paste anything.',
    inputSchema: {
      type: 'object',
      properties: {
        compact: { type: 'boolean', description: 'short form instead of the full brief' }
      }
    }
  },
  {
    name: 'rc_sync_report',
    description:
      'What changed in the repo since each doc was last verified, and which docs likely need updating. Call this before rc_prepare_fill when the task is "update the docs after code changes", then write the affected .ai/*.md files yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'git ref to diff from (defaults to each doc\'s verified_at commit)' }
      }
    }
  }
];

/**
 * Invokes an MCP tool by name with arguments against a root workspace.
 *
 * @param {string} root - Project root directory
 * @param {string} toolName - Tool name to execute
 * @param {Record<string, any>} [args={}] - Tool arguments
 * @returns {string} Result text
 */
function executeTool(root, toolName, args = {}) {
  switch (toolName) {
    case 'rc_context': {
      const result = packContext(root, {
        query: args.query || '',
        files: args.files || [],
        maxTokens: Math.min(Number(args.max_tokens) || 4000, 20000)
      });
      const includedSummary = result.included
        .map(item => `${item.rel}(~${item.tokens}t)`)
        .join(', ');
      const skippedSummary = result.skipped.length
        ? ` | skipped: ${result.skipped.join(', ')}`
        : '';
      return `${result.text}\n---\nincluded: ${includedSummary}${skippedSummary}`;
    }

    case 'rc_module': {
      const slug = toSlug(String(args.name || ''));
      const docPath = path.join(root, '.ai', 'modules', `${slug}.md`);
      const content = read(docPath);
      if (content === null) {
        const knownModules = getModuleMap(root).map(m => m.slug).join(', ');
        throw new Error(`no module doc "${slug}". Known: ${knownModules}`);
      }
      return content;
    }

    case 'rc_find_owner': {
      const normalizedPath = String(args.path || '').replace(/^\.\//, '');
      const owners = getModuleMap(root).filter(mod =>
        mod.paths.some(prefix => isPathInside(normalizedPath, prefix))
      );

      if (!owners.length) {
        return 'no module owns this path';
      }

      return JSON.stringify(
        owners.map(mod => ({
          module: mod.slug,
          doc: mod.doc,
          paths: mod.paths
        })),
        null,
        2
      );
    }

    case 'rc_status': {
      return JSON.stringify(getDocStatus(root), null, 2);
    }

    case 'rc_prepare_fill': {
      return buildFillPrompt(root, { compact: Boolean(args.compact) });
    }

    case 'rc_sync_report': {
      const report = syncProject(root, { since: args.since || undefined });
      return formatSyncReport(report);
    }

    default:
      throw new Error(`unknown tool ${toolName}`);
  }
}

module.exports = {
  MCP_TOOLS,
  executeTool,
  call: executeTool
};
