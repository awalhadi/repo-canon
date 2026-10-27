'use strict';

const fs = require('fs');
const path = require('path');
const { exists, read, write } = require('../core/fs');

const HOOK_SNIPPET = `# repocanon: warn if code changed but .ai/ did not
STAGED=$(git diff --cached --name-only)
if echo "$STAGED" | grep -qv '^\\.ai/' && ! echo "$STAGED" | grep -q '^\\.ai/'; then
  echo "repocanon: code changed but .ai/ not touched (STATE.md / module doc?). Check: npx repocanon status"
fi
`;

/**
 * Installs a git pre-commit warning hook in the target repository.
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

  if (currentContent && currentContent.includes('repocanon')) {
    return 'already installed';
  }

  const newContent =
    (currentContent ? `${currentContent.trimEnd()}\n\n` : '#!/usr/bin/env bash\n') +
    HOOK_SNIPPET;

  write(hookPath, newContent);
  fs.chmodSync(hookPath, 0o755);

  return 'installed (warning only, never blocks commits)';
}

module.exports = {
  installPreCommitHook,
  install: installPreCommitHook,
  HOOK_SNIPPET
};
