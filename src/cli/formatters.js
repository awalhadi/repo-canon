'use strict';

const { STATUS_ICONS } = require('../core/constants');

/**
 * Prints data as formatted JSON to stdout.
 * @param {any} data
 */
function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * One GitHub Actions workflow command, so a finding shows inline on the PR's
 * Files tab. Escapes per GitHub's rules: % \r \n in the message, plus , and : in properties.
 *
 * @param {'error'|'warn'|'info'} level
 * @param {string} msg
 * @param {{ file?: string, line?: number }} [where={}]
 * @returns {string}
 */
function formatGithubAnnotation(level, msg, where = {}) {
  const command = level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'notice';
  const escapeData = value => String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const escapeProperty = value => escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
  const props = [
    where.file ? `file=${escapeProperty(where.file)}` : null,
    where.line ? `line=${escapeProperty(where.line)}` : null,
    'title=RepoCanon'
  ].filter(Boolean).join(',');
  return `::${command} ${props}::${escapeData(msg)}`;
}

/**
 * GitHub annotations when asked for, or automatically in GitHub Actions CI runs.
 *
 * @param {{ options: Record<string, string>, isCi: boolean }} context
 * @returns {boolean}
 */
function wantsGithubFormat(context) {
  return context.options.format === 'github' || (context.isCi && process.env.GITHUB_ACTIONS === 'true' && !context.options.format);
}

module.exports = {
  formatGithubAnnotation,
  wantsGithubFormat,
  STATUS_ICONS,
  printJson
};
