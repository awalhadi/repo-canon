'use strict';

const path = require('path');
const { read, toSlug, isPathInside } = require('../core/fs');
const { packContext, getModuleMap } = require('../services/pack.service');
const { getDocStatus } = require('../services/status.service');
const { buildFillPrompt } = require('../services/prompt.service');
const { syncProject, formatSyncReport } = require('../services/sync.service');
const { stampDocs } = require('../services/status.service');
const { proposeAdr, checkpointState, verifyKnowledge } = require('../services/memory.service');

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const WRITES_DOCS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const MAX_STAMP_DOCS = 20;

const MCP_TOOLS = [
  {
    name: 'rc_context',
    description:
      'Budgeted context pack for a task: PROJECT + relevant module docs + DOMAIN/CONVENTIONS/STATE. Call this FIRST instead of scanning the repo. Docs that may not match the code carry a stale/broken/unverified label — trust the code there.',
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
    },
    annotations: READ_ONLY
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
    },
    annotations: READ_ONLY
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
    },
    annotations: READ_ONLY
  },
  {
    name: 'rc_status',
    description: 'Freshness of every .ai doc (fresh/stale/broken/unverified) vs git.',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    annotations: READ_ONLY
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
    },
    annotations: READ_ONLY
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
    },
    annotations: READ_ONLY
  },
  {
    name: 'rc_propose_adr',
    description:
      'Record an architecture decision in .ai/DECISIONS.md (numbered D-NNN, newest on top). Use when a task settled a choice future work must respect. One line per field; refused if it contains secrets, pasted code, trees or a duplicate title.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'short name of the decision (max 80 chars)' },
        decision: { type: 'string', description: 'what was decided (one line)' },
        why: { type: 'string', description: 'the reason (one line)' },
        revisit: { type: 'string', description: 'when to reconsider (optional)' },
        supersedes: { type: 'string', description: 'id of a decision this replaces, e.g. D-003 (optional)' }
      },
      required: ['title', 'decision', 'why']
    },
    annotations: WRITES_DOCS
  },
  {
    name: 'rc_checkpoint_state',
    description:
      'Record where work stands in .ai/STATE.md so the next session can pick up: current focus, in-progress items, known issues, and one line for a significant change. Only the sections you pass change. This does NOT mark any doc verified.',
    inputSchema: {
      type: 'object',
      properties: {
        focus: { type: 'string', description: 'what the project is working on now (one line)' },
        in_progress: { type: 'array', items: { type: 'string' }, description: 'replaces the In progress list (max 8)' },
        known_issues: { type: 'array', items: { type: 'string' }, description: 'replaces the Known issues list (max 8)' },
        change: { type: 'string', description: 'one significant change to log with today\'s date' }
      }
    },
    annotations: WRITES_DOCS
  },
  {
    name: 'rc_stamp',
    description:
      'Mark docs verified against the current commit (verified_by: agent). Only after you have read the code and updated each doc so it matches; commit the code first — docs with uncommitted code changes are refused. Name every doc (module slug or core doc name such as STATE).',
    inputSchema: {
      type: 'object',
      properties: {
        docs: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MAX_STAMP_DOCS }
      },
      required: ['docs']
    },
    annotations: { ...WRITES_DOCS, idempotentHint: true }
  },
  {
    name: 'rc_verify',
    description:
      'Am I done? Checks the knowledge layer: doctor errors and warnings, stale or broken docs, the Freshness Score. Ends with PASS or FAIL. Call before finishing a task that changed code or docs; pass docs to check only those.',
    inputSchema: {
      type: 'object',
      properties: {
        docs: { type: 'array', items: { type: 'string' }, description: 'module slugs or core doc names (optional)' }
      }
    },
    annotations: READ_ONLY
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
      const staleDocs = Object.entries(result.freshness)
        .filter(([, state]) => state === 'stale' || state === 'broken')
        .map(([rel]) => rel.replace(/^\.ai\//, ''));
      const staleSummary = staleDocs.length ? ` | stale: ${staleDocs.join(', ')}` : '';
      return `${result.text}\n---\nincluded: ${includedSummary}${skippedSummary}${staleSummary}`;
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

    case 'rc_propose_adr': {
      const result = proposeAdr(root, args);
      if (!result.ok) throw new Error(`not recorded:\n- ${result.problems.join('\n- ')}`);
      return [`Added ${result.id} to ${result.file}`, ...result.warnings].join('\n');
    }

    case 'rc_checkpoint_state': {
      const result = checkpointState(root, args);
      if (!result.ok) throw new Error(`not recorded:\n- ${result.problems.join('\n- ')}`);
      return `Updated ${result.file}: ${result.sections.join(', ')} (no doc was marked verified)`;
    }

    case 'rc_stamp': {
      const names = Array.isArray(args.docs) ? args.docs.map(String).filter(Boolean) : [];
      if (!names.length || names.length > MAX_STAMP_DOCS) {
        throw new Error(`docs must list 1–${MAX_STAMP_DOCS} doc names`);
      }
      const result = stampDocs(root, { names, by: 'agent' });
      if (!result.head) throw new Error('nothing stamped: the repo has no commit yet');
      if (result.unknown.length) {
        throw new Error(`no doc named ${result.unknown.join(', ')} — nothing stamped. Known: ${result.known.join(', ')}`);
      }
      const lines = [
        ...result.stamped.map(doc => `✓ ${doc} verified at ${result.head} (verified_by: agent)`),
        ...result.refused.map(({ doc, reason }) => `✗ ${doc}: ${reason.replace(' (or --force)', '')}`)
      ];
      if (!result.stamped.length) throw new Error(lines.join('\n'));
      return lines.join('\n');
    }

    case 'rc_verify': {
      const result = verifyKnowledge(root, { docs: args.docs });
      const section = (title, items) => (items.length ? [`${title}:`, ...items.map(item => `- ${item}`)] : []);
      return [
        ...section('Errors', result.errors),
        ...section('Stale or broken docs (update them to match the code, commit, then rc_stamp)', result.stale),
        ...section('Warnings', result.warnings),
        result.score,
        result.pass ? 'PASS' : `FAIL: ${result.errors.length} error(s), ${result.stale.length} stale/broken doc(s)`
      ].filter(Boolean).join('\n');
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
