'use strict';

const { read, write } = require('./fs');

const BLOCK_START = '<!-- repocanon:start -->';
const BLOCK_END = '<!-- repocanon:end -->';

/**
 * Idempotently injects or replaces a managed block in a file.
 *
 * @param {string} filePath - Target file path
 * @param {string} body - Content to place inside the managed block
 * @param {string} [prefix=''] - Optional content prefix if file is being created
 * @returns {'created'|'updated'|'appended'|'unchanged'} Mutation status
 */
function upsertManagedBlock(filePath, body, prefix = '') {
  const blockContent = `${BLOCK_START}\n${body.trim()}\n${BLOCK_END}`;
  const currentContent = read(filePath);

  if (currentContent === null) {
    write(filePath, `${prefix}${blockContent}\n`);
    return 'created';
  }

  if (currentContent.includes(BLOCK_START)) {
    const blockRegex = new RegExp(`${BLOCK_START}[\\s\\S]*?${BLOCK_END}`);
    const nextContent = currentContent.replace(blockRegex, () => blockContent);
    if (nextContent === currentContent) {
      return 'unchanged';
    }
    write(filePath, nextContent);
    return 'updated';
  }

  write(filePath, `${currentContent.trimEnd()}\n\n${blockContent}\n`);
  return 'appended';
}

module.exports = {
  BLOCK_START,
  BLOCK_END,
  upsertManagedBlock
};
