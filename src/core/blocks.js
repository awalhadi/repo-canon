'use strict';

const fs = require('fs');
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

/**
 * Body of the managed block in a file.
 *
 * @param {string} filePath
 * @returns {string|null} trimmed body, or null when the file or block is absent
 */
function readManagedBlock(filePath) {
  const content = read(filePath);
  if (content === null) {
    return null;
  }
  const start = content.indexOf(BLOCK_START);
  const end = content.indexOf(BLOCK_END, start);
  if (start === -1 || end === -1) {
    return null;
  }
  return content.slice(start + BLOCK_START.length, end).trim();
}

/**
 * Removes only the managed block, never the user's own text. Deletes the file when
 * nothing else is left (whitespace, or just the `prefix` RepoCanon wrote on creation).
 *
 * @param {string} filePath
 * @param {string} [prefix='']
 * @returns {'removed'|'deleted'|'absent'}
 */
function removeManagedBlock(filePath, prefix = '') {
  const content = read(filePath);
  if (content === null || !content.includes(BLOCK_START)) {
    return 'absent';
  }

  const blockRegex = new RegExp(`\\n*${BLOCK_START}[\\s\\S]*?${BLOCK_END}\\n?`);
  const rest = content.replace(blockRegex, '\n');
  const leftover = rest.trim();

  if (!leftover || (prefix && leftover === prefix.trim())) {
    fs.unlinkSync(filePath);
    return 'deleted';
  }
  write(filePath, `${rest.trim()}\n`);
  return 'removed';
}

module.exports = {
  BLOCK_START,
  BLOCK_END,
  upsertManagedBlock,
  readManagedBlock,
  removeManagedBlock
};
