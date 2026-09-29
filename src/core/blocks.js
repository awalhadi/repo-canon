'use strict';

const { read, write } = require('./fs');

const BLOCK_START = '<!-- repocanon:start -->';
const BLOCK_END = '<!-- repocanon:end -->';
const LEGACY_BLOCK_START = '<!-- contextforge:start -->';
const LEGACY_BLOCK_END = '<!-- contextforge:end -->';

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

  if (currentContent.includes(BLOCK_START) || currentContent.includes(LEGACY_BLOCK_START)) {
    const hasCurrent = currentContent.includes(BLOCK_START);
    const startPattern = hasCurrent ? BLOCK_START : LEGACY_BLOCK_START;
    const endPattern = hasCurrent ? BLOCK_END : LEGACY_BLOCK_END;
    const blockRegex = new RegExp(`${startPattern}[\\s\\S]*?${endPattern}`);
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
  LEGACY_BLOCK_START,
  LEGACY_BLOCK_END,
  upsertManagedBlock
};
