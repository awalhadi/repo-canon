'use strict';

const fs = require('fs');
const path = require('path');
const { exists, read, write } = require('../core/fs');

const HOOK_START = '# repocanon:start';
const HOOK_END = '# repocanon:end';

/**
 * The 0.5.0 hook (warning only, no markers) — replaced in place on upgrade.
 */
const LEGACY_HOOK_SNIPPET = `# repocanon: warn if code changed but .ai/ did not
STAGED=$(git diff --cached --name-only)
if echo "$STAGED" | grep -qv '^\\.ai/' && ! echo "$STAGED" | grep -q '^\\.ai/'; then
  echo "repocanon: code changed but .ai/ not touched (STATE.md / module doc?). Check: npx repocanon status"
fi
`;

/**
 * Warns when code changes without any .ai/ update (never blocks), and blocks a commit
 * that would add a secret to AGENTS.md or .ai/ docs. Uses a local or global repocanon
 * only — never the network; without one, the secret check is skipped silently.
 */
const HOOK_SNIPPET = `${HOOK_START}
# Warn if code changed but .ai/ did not (never blocks)
STAGED=$(git diff --cached --name-only)
if echo "$STAGED" | grep -qv '^\\.ai/' && ! echo "$STAGED" | grep -q '^\\.ai/'; then
  echo "repocanon: code changed but .ai/ not touched (STATE.md / module doc?). Check: npx repocanon status"
fi
# Block secrets and unsafe instructions in staged agent docs (override: git commit --no-verify)
if [ -x ./node_modules/.bin/repocanon ]; then RC=./node_modules/.bin/repocanon
elif command -v repocanon >/dev/null 2>&1; then RC=repocanon
else RC=""; fi
if [ -n "$RC" ] && ! "$RC" secrets --staged --quiet; then
  echo "repocanon: commit blocked — secret or unsafe instruction in staged docs (see above). Override: git commit --no-verify"
  exit 1
fi
${HOOK_END}
`;

/**
 * Installs or upgrades the RepoCanon pre-commit hook. Only RepoCanon's own block
 * (or the unmarked 0.5.0 snippet) is ever replaced; other hook content stays.
 *
 * @param {string} root - Project root directory
 * @returns {string} Status message
 */
function installPreCommitHook(root) {
  const gitDir = path.join(root, '.git');
  if (!exists(gitDir)) {
    return 'no .git folder';
  }

  const hookPath = path.join(gitDir, 'hooks/pre-commit');
  const currentContent = read(hookPath);
  let nextContent;
  let status = 'installed';

  if (currentContent && currentContent.includes(HOOK_START) && currentContent.includes(HOOK_END)) {
    const start = currentContent.indexOf(HOOK_START);
    const end = currentContent.indexOf(HOOK_END, start) + HOOK_END.length;
    nextContent = `${currentContent.slice(0, start)}${HOOK_SNIPPET.trimEnd()}${currentContent.slice(end)}`;
    if (nextContent === currentContent) {
      return 'already installed';
    }
    status = 'updated';
  } else if (currentContent && currentContent.includes(LEGACY_HOOK_SNIPPET)) {
    nextContent = currentContent.replace(LEGACY_HOOK_SNIPPET, HOOK_SNIPPET);
    status = 'updated';
  } else if (currentContent && currentContent.includes('repocanon')) {
    return 'already installed (custom repocanon lines found, left unchanged)';
  } else {
    nextContent = (currentContent ? `${currentContent.trimEnd()}\n\n` : '#!/usr/bin/env bash\n') + HOOK_SNIPPET;
  }

  write(hookPath, nextContent);
  fs.chmodSync(hookPath, 0o755);

  return `${status} (warns on undocumented code changes; blocks commits that add secrets to .ai/ docs)`;
}

module.exports = {
  installPreCommitHook,
  install: installPreCommitHook,
  HOOK_SNIPPET,
  LEGACY_HOOK_SNIPPET
};
