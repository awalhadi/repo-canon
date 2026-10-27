'use strict';

const fs = require('fs');
const path = require('path');
const pkg = require('../../package.json');
const { read, renderTemplate } = require('../core/fs');
const { getHeadShort } = require('../core/git');
const { estimateRepoTokens } = require('../core/tokens');
const { getProjectOverview } = require('./analyze.service');
const { collectProjectFacts } = require('./facts.service');

const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

const PLAYBOOK = {
  Laravel: {
    project: [
      '`composer.json` · `package.json` · `.env.example` (names only) · `config/*.php` → stack, integrations, queues, mail, storage',
      '`routes/*.php` → surfaces (web / api / console / channels), guards, middleware groups',
      '`bootstrap/app.php` or `app/Http/Kernel.php` → request pipeline'
    ],
    domain: [
      '`app/Models/*` → relations, `$fillable` / `$casts`, scopes, soft-deletes, accessors that hide rules',
      '`app/Enums` and status columns/constants → **state machines**',
      '`app/Policies`, `Gate::`, middleware (`role`, `can`, `auth:*`) → **permission matrix**',
      '`app/Services` · `Actions` · `Jobs` · `Observers` · events/listeners → side-effects, invariants, money/quota logic',
      '`database/migrations` (newest first) → constraints, unique keys, cascades, nullability',
      '`tests/` → asserted behaviour = highest-signal source of rules'
    ],
    conventions: [
      'controller → request → service layering *as actually practised* (sample 3 controllers)',
      'validation style (FormRequest vs inline), response shape (Resources vs arrays), error handling',
      'naming, folder rules, `pint` / `phpstan` / `.editorconfig`'
    ]
  },
  Vue: {
    project: [
      'entry (`resources/js/app.*` or `src/main.*`), router, store bootstrap, build tool (Vite/Mix)'
    ],
    domain: [
      'route guards & store modules → client-side rules that mirror (or duplicate) server rules',
      'API client layer (axios/fetch wrappers) → which endpoints the UI depends on'
    ],
    conventions: [
      'Options vs Composition API, `<script setup>`, state management, i18n, UI library, component naming'
    ]
  },
  'Next.js': {
    project: ['`app/` or `pages/` routing, `middleware.ts`, `next.config.*`, env usage'],
    domain: ['server actions / route handlers, auth middleware, data-access layer, schema (`prisma`/`drizzle`)'],
    conventions: ['server vs client components, data fetching pattern, folder colocation']
  },
  NestJS: {
    project: ['`main.ts`, root `AppModule`, global pipes/filters/guards'],
    domain: ['guards & decorators → permissions; DTO validation → input rules; entities/migrations → constraints; providers → business services'],
    conventions: ['module boundaries, DTO/entity naming, exception filters, testing style']
  },
  Django: {
    project: ['`settings*`, root `urls.py`, installed apps, celery/beat'],
    domain: ['models & managers, signals, permissions/DRF permission classes, serializers validation, admin actions'],
    conventions: ['app layout, fat-model vs service layer, serializer patterns, test style']
  },
  Rails: {
    project: ['`config/routes.rb`, `config/application.rb`, initializers, `Gemfile`'],
    domain: ['models & concerns, validations/callbacks, policies, service objects, jobs, `db/schema.rb`'],
    conventions: ['service/query object usage, naming, rubocop config, spec style']
  },
  Go: {
    project: ['`cmd/*/main.go`, `internal/` layout, config loading, `go.mod`'],
    domain: ['domain structs & interfaces, handlers/middleware, repositories, error types'],
    conventions: ['package layout, error wrapping, context usage, table-driven tests']
  },
  React: {
    project: ['entry, router, state management, build tool'],
    domain: ['hooks/services holding business rules, API layer, route guards'],
    conventions: ['component style, state, data fetching, styling system']
  },
  Tauri: {
    project: ['`src-tauri/tauri.conf.json`, Rust commands (`#[tauri::command]`), frontend ↔ backend IPC boundary'],
    domain: ['Rust command handlers = business logic; permissions/capabilities; local storage schema'],
    conventions: ['command naming, error type mapping, frontend invoke wrappers']
  },
  '*': {
    project: ['README, entry points, config, container/CI files'],
    domain: ['tests, validation code, permission checks, status/enum definitions'],
    conventions: ['linter/formatter configs + 4–5 representative files']
  }
};

const resolvePlaybook = (stacks, key) => {
  const activeKeys = stacks.filter(s => PLAYBOOK[s]);
  const matchedKeys = activeKeys.length ? activeKeys : ['*'];
  return matchedKeys.flatMap(k =>
    PLAYBOOK[k][key].map(item => (matchedKeys.length > 1 ? `**${k}** · ${item}` : item))
  );
};

const escapeTable = str => String(str).replace(/\|/g, '\\|');

const formatTable = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `|${headers.map(() => '---').join('|')}|`,
  ...rows.map(r => `| ${r.map(escapeTable).join(' | ')} |`)
].join('\n');

const formatList = (arr, max = 14) =>
  arr.length
    ? arr.slice(0, max).join(', ') + (arr.length > max ? ` … +${arr.length - max}` : '')
    : '—';

const formatNumber = num => Number(num).toLocaleString('en-US');

/**
 * Assesses the current state and completeness of .ai/ documentation files.
 */
function getDocumentState(root) {
  const rows = [];
  const coreFiles = ['PROJECT', 'DOMAIN', 'CONVENTIONS', 'DECISIONS', 'STATE'];

  for (const doc of coreFiles) {
    const text = read(path.join(root, '.ai', `${doc}.md`));
    if (text === null) {
      rows.push([`${doc}.md`, '—', '—', 'missing → run `repocanon init`']);
      continue;
    }
    const todos = (text.match(/TODO/g) || []).length;
    const action =
      todos === 0
        ? 'filled → refine only'
        : todos >= 6
        ? 'empty → fill'
        : 'partial → complete TODOs';

    rows.push([`${doc}.md`, text.split('\n').length, todos, action]);
  }

  const modulesDir = path.join(root, '.ai', 'modules');
  let moduleDocCount = 0;
  if (fs.existsSync(modulesDir)) {
    try {
      moduleDocCount = fs
        .readdirSync(modulesDir)
        .filter(f => f.endsWith('.md') && !f.startsWith('_')).length;
    } catch {
      // Ignore read error
    }
  }
  rows.push(['modules/*.md', '—', '—', `${moduleDocCount} module doc(s) exist`]);

  return rows;
}

/**
 * Builds the AI fill prompt brief (compact or rich evidence-based format).
 *
 * @param {string} root - Project root directory
 * @param {{ compact?: boolean }} [options={}]
 * @returns {string} Generated fill prompt
 */
function buildFillPrompt(root, options = {}) {
  const overview = getProjectOverview(root);

  if (options.compact) {
    const compactTemplate = read(path.join(TEMPLATES_DIR, 'prompts', 'fill.md'));
    const topSummary = Object.entries(overview.top)
      .sort()
      .map(([k, v]) => `${k}(${v})`)
      .join(' ');
    const moduleList =
      overview.mods.map(m => `- ${m.slug}: ${m.paths.join(', ')}`).join('\n') || '- (none detected)';

    return renderTemplate(compactTemplate, {
      stack: overview.d.stacks.join(', ') || 'unknown',
      run: overview.d.run,
      test: overview.d.test,
      top: topSummary,
      modules: moduleList
    });
  }

  const projectFacts = collectProjectFacts(root, overview);
  const stacks = overview.d.stacks;
  const packages = projectFacts.packages;
  const gitMeta = projectFacts.git;
  const repoTokensCount = estimateRepoTokens(root);

  const lines = [];
  const appendSection = heading => lines.push('', heading, '');

  lines.push(
    `# RepoCanon · Knowledge-Layer Fill Brief`,
    '',
    `\`${overview.d.name}\` · ${new Date().toISOString().slice(0, 10)} · RepoCanon ${pkg.version}${
      gitMeta.branch ? ` · branch \`${gitMeta.branch}\`` : ''
    }${getHeadShort(root) ? ` @ \`${getHeadShort(root)}\`` : ''}`,
    '',
    '> Self-contained brief for an AI coding agent (Claude Code, Cursor, Windsurf, Copilot, Gemini…). Everything in §2 is machine-extracted from the repo — treat it as ground truth and do not spend tokens re-discovering it.',
    '',
    '---'
  );

  appendSection('## 1 · Role & mission');
  lines.push(
    `You are a **principal software architect and technical writer**. Extract what an agent **cannot learn by reading the code** — rules, decisions, boundaries, gotchas — into the \`.ai/\` layer, so any future agent works correctly from **~1k tokens of entry context plus one module doc** instead of scanning **~${formatNumber(
      Math.round(repoTokensCount / 1000)
    )}k tokens** of source.`,
    '',
    '*Why this matters:* context files that restate the codebase (overviews, structure, dependency lists) make agents slightly *less* successful and >20% more expensive. Every line you write must earn its tokens.',
    '',
    '**Success test** — a future agent, reading only `.ai/`, can answer:',
    '',
    formatTable(
      ['#', 'Question', 'Lives in'],
      [
        ['1', 'What is this system, for whom, and how is it run/deployed?', 'PROJECT.md'],
        ['2', 'Which module owns feature X, and what is non-obvious about it?', 'INDEX.md · modules/'],
        ['3', 'What must never break — rules, states, permissions, money?', 'DOMAIN.md'],
        ['4', 'How must new code be written, and what is forbidden?', 'CONVENTIONS.md'],
        ['5', 'Why is it built this way?', 'DECISIONS.md'],
        ['6', 'What is in flight, fragile or unfinished?', 'STATE.md']
      ]
    )
  );

  lines.push('', '---');
  appendSection('## 2 · Ground truth *(auto-detected)*');

  lines.push(
    '### 2.1 Identity',
    '',
    formatTable(
      ['', ''],
      [
        ['Project', `${overview.d.name}${projectFacts.readme ? ` — “${projectFacts.readme}”` : ''}`],
        ['Stack', stacks.join(' · ') || 'unknown'],
        ['Commands', `run \`${overview.d.run}\` · test \`${overview.d.test}\` · lint \`${overview.d.lint}\``],
        [
          'Size',
          `${formatNumber(overview.files.length)} files · ≈${formatNumber(
            Math.round(repoTokensCount / 1000)
          )}k tokens (estimate) — **never read it all**`
        ],
        [
          'Git',
          gitMeta.total
            ? `${formatNumber(gitMeta.total)} commits${gitMeta.since ? ` since ${gitMeta.since}` : ''} · ${gitMeta.dirty} uncommitted path(s)`
            : 'no git history'
        ]
      ]
    )
  );

  lines.push(
    '',
    '### 2.2 Structure',
    '',
    formatTable(
      ['Path', 'Files', 'Role', 'Read?'],
      projectFacts.top.map(t => [
        t.path.startsWith('(') ? t.path : `${t.path}/`,
        t.files,
        t.role,
        t.skip ? '✗ skip' : '✓'
      ])
    )
  );

  if (projectFacts.anchors.length) {
    lines.push(
      '',
      '### 2.3 Signals — what exists, by kind',
      '',
      formatTable(
        ['Kind', 'Count', 'Sample'],
        projectFacts.anchors.map(a => [
          a.label,
          a.count,
          a.sample.length ? a.sample.join(', ') + (a.more ? ` … +${a.more}` : '') : '—'
        ])
      )
    );
  }

  const dependencies = [];
  if (packages.composer) {
    dependencies.push(
      ['Composer', formatList(packages.composer, 16)],
      ['Composer (dev)', formatList(packages.composerDev, 10)]
    );
  }
  if (packages.npm) {
    dependencies.push(
      ['npm', formatList(packages.npm, 16)],
      ['npm (dev)', formatList(packages.npmDev, 10)]
    );
  }
  const scripts = [
    ...(packages.npmScripts || []).map(s => `npm:${s}`),
    ...(packages.composerScripts || []).map(s => `composer:${s}`)
  ];
  if (scripts.length) {
    dependencies.push(['Scripts', formatList(scripts, 14)]);
  }
  if (projectFacts.env) {
    dependencies.push([
      `Env (${projectFacts.env.file}, ${projectFacts.env.total} keys)`,
      `${formatList(projectFacts.env.prefixes, 18)} *(names only — values never read)*`
    ]);
  }
  if (dependencies.length) {
    lines.push('', '### 2.4 Dependencies & configuration', '', formatTable(['Source', 'Detected'], dependencies));
  }

  if (projectFacts.hot.length) {
    lines.push(
      '',
      '### 2.5 Hotspots — most-changed files (last ≤300 commits)',
      '',
      formatTable(
        ['#', 'File', 'Changes'],
        projectFacts.hot.map(([f, count], i) => [i + 1, `\`${f}\``, count])
      ),
      '',
      '*High churn ≈ where the business actually lives. Weigh these when choosing modules in Phase 4.*'
    );
  }

  if (gitMeta.recent.length) {
    lines.push('', '### 2.6 Recent history', '', ...gitMeta.recent.map(r => `- ${r}`));
  }

  lines.push(
    '',
    '### 2.7 Module candidates *(heuristic — verify and correct)*',
    '',
    overview.mods.length
      ? formatTable(
          ['Module', 'Code paths', 'Files', 'Doc'],
          overview.mods.map(m => [m.slug, m.paths.join(', '), m.files, m.has ? '✓' : '—'])
        )
      : '_none detected_',
    '',
    '> Detection is folder-name based. Watch for: layers mistaken for domains, missing frontend/view areas, third-party folders. Report fixes in the final report (§6) as a `.repocanon.json` snippet.'
  );

  lines.push('', '### 2.8 Current `.ai/` state', '', formatTable(['Doc', 'Lines', 'TODOs', 'Action'], getDocumentState(root)));

  lines.push('', '---');
  appendSection('## 3 · Operating rules');
  lines.push(
    '**Evidence protocol** — every statement in the docs must be one of:',
    '',
    '- ✅ **verified** — you saw it in code/config/tests; add a `path:symbol` pointer when non-obvious',
    '- 🔶 **inferred** — reasoned from evidence; suffix with `(inferred)`',
    '- ❓ **unknown** — write `TODO: verify`. *Never guess. Never present assumptions as facts.*',
    '',
    '**Reading budget** — aim for **≤ 40 targeted file reads**. Search (`grep`/symbol lookup) before browsing. Follow the hotspots and signals above.',
    `**Never read:** ${projectFacts.skip.map(s => '`' + s + '`').join(' · ')}.`,
    '',
    '**Writing rules**',
    '- Tables and bullets. **No source code** in docs; use `path:symbol` pointers. Semantic index, not a code mirror.',
    '- Phrase rules as testable invariants: *“X must / must never Y”* (numbered `INV-01…` in DOMAIN.md).',
    '- Line caps: PROJECT ≤150 · DOMAIN ≤300 · CONVENTIONS ≤120 · module ≤100 · STATE ≤80.',
    '- Preserve existing human-written text and all frontmatter; **only** replace TODO placeholders and fix proven inaccuracies. Keep the `cf:auto` block in INDEX.md untouched.',
    '- **Do not modify source code.**',
    '',
    '**Do not write** — an agent gets these by reading the repo, so they only cost tokens:',
    '- directory trees or folder walkthroughs (the auto block in INDEX.md already maps modules)',
    '- dependency or version lists (they are in the manifests)',
    '- file-by-file catalogues outside a module\'s code map, and code maps that only restate file names',
    '- explanations of how the framework works, or generic architecture prose',
    '- pasted source code — point to it as `path:symbol`',
    '- stack and run/test/lint commands — AGENTS.md already has them',
    '',
    '`repocanon doctor` flags directory trees, dependency lists, pasted code and file catalogues it finds in `.ai/`.'
  );

  lines.push('', '---');
  appendSection('## 4 · Work plan *(sequential — finish each phase before the next)*');

  lines.push(
    '### Phase 1 · `PROJECT.md` + INDEX entry points',
    '**Look at**',
    ...resolvePlaybook(stacks, 'project').map(x => `- ${x}`),
    '**Produce** — one-line purpose · users/actors · boundaries (what owns what, what must not call what) · external services · environments/deploy · entry points that are not obvious from folder names (INDEX.md “Entry points”). Skip what the manifests and folder layout already show. Aim for ≤40 lines.',
    '**Done when** — an engineer new to the repo could run it and name every external dependency.'
  );

  lines.push(
    '',
    '### Phase 2 · `DOMAIN.md` — *the most valuable file*',
    '**Look at**',
    ...resolvePlaybook(stacks, 'domain').map(x => `- ${x}`),
    '**Produce**',
    '- Glossary (business terms → meaning) · Entities & relationships (compact) · **State machines** (`state → state : trigger : guard`)',
    '- **Permission matrix** (role × capability) · money / quota / limits rules · integrations & side-effects · numbered **Invariants** `INV-01…`',
    '**Done when** — every rule cites where it is enforced (`path:symbol`) or is marked `TODO: verify`; nothing is copied from code.'
  );

  lines.push(
    '',
    '### Phase 3 · `CONVENTIONS.md`',
    '**Look at**',
    ...resolvePlaybook(stacks, 'conventions').map(x => `- ${x}`),
    '**Produce** — where new code goes · naming · validation/error/response patterns · test approach · a **“Do NOT”** list of anti-patterns this codebase avoids.',
    '**Done when** — a new file written from this doc would pass review.'
  );

  lines.push(
    '',
    '### Phase 4 · Module docs (top 3)',
    '- Rank candidates in §2.7 by **hotspot presence × business criticality**; pick 3. Create `.ai/modules/<slug>.md` from `_TEMPLATE.md`.',
    '- Fill `code_paths` (fix them if §2.7 is wrong), Purpose, Invariants, Flow (steps, no code), Code map (`path: responsibility`), Gotchas (what the code does not make obvious).',
    '**Done when** — “change feature X” can be answered by that one doc + the files in its code map.'
  );

  lines.push(
    '',
    '### Phase 5 · `STATE.md` + `DECISIONS.md`',
    '- STATE: current focus, in-progress, known issues — from §2.6, TODO/FIXME comments, and uncommitted work. **Do not invent progress.**',
    '- DECISIONS: only choices evidenced by code, config, README or commit messages (Decision · Why · Revisit if). Otherwise `TODO: verify`.'
  );

  lines.push(
    '',
    '### Phase 6 · Verify',
    '- Run `repocanon doctor` and fix every error/warning you caused — including every inferable-content warning (delete those blocks). Then `repocanon stamp <doc>…` for each doc you actually re-checked (commit code first).'
  );

  lines.push('', '---');
  appendSection('## 5 · Self-review *(tick before finishing)*');
  lines.push(
    '- [ ] No source code pasted; every non-obvious claim has a `path:symbol` pointer',
    '- [ ] Every rule is an invariant a test could assert',
    '- [ ] Nothing guessed — unknowns are `TODO: verify`',
    '- [ ] Line caps respected; entry context (AGENTS + PROJECT + INDEX) stays small',
    '- [ ] DOMAIN.md would prevent the 3 most likely mistakes a newcomer/agent would make here',
    '- [ ] Module `code_paths` exist on disk',
    '- [ ] Nothing an agent could learn by reading the code: `repocanon doctor` reports no inferable content'
  );

  lines.push('', '---');
  appendSection('## 6 · Final report *(exact format)*');
  lines.push(
    '```',
    '1. FILLED      file → what was written',
    '2. STILL TODO  file → item → why it could not be confirmed',
    '3. RISKS       doc↔code conflicts, fragile areas, surprising behaviour',
    '4. MODULE MAP  corrections as a .repocanon.json snippet:',
    '               { "modules": { "<slug>": ["<path>/"] }, "exclude": ["<path>/"] }',
    '5. DOCTOR      output of `repocanon doctor`',
    '```'
  );

  return lines.join('\n');
}

module.exports = {
  buildFillPrompt,
  buildFill: buildFillPrompt,
  PLAYBOOK
};
