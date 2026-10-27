#!/usr/bin/env node
'use strict';

/**
 * Renders coloured terminal output (ANSI) as an SVG "screenshot" for the README.
 * Zero dependencies; regenerate with:
 *
 *   node scripts/render-terminal-svg.js status > docs/assets/terminal.svg
 */

const { runExamples } = require('./readme-examples');

const PALETTE = { 31: '#ff6b6b', 32: '#5fd38d', 33: '#f5c451', 36: '#5ccfe6' };
const FG = '#d7dae0';
const BG = '#1e2127';
const CHAR_W = 8.4;
const LINE_H = 20;
const PAD = 20;
const TOP = 44;

const escapeXml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Splits one line into styled runs.
 *
 * @param {string} line
 * @returns {Array<{ text: string, color: string, bold: boolean, dim: boolean }>}
 */
function toRuns(line) {
  const runs = [];
  const state = { color: FG, bold: false, dim: false };
  for (const part of line.split(/(\x1b\[[0-9;]*m)/)) {
    const code = part.match(/^\x1b\[([0-9;]*)m$/);
    if (!code) {
      if (part) runs.push({ text: part, ...state });
      continue;
    }
    for (const n of code[1].split(';').map(Number)) {
      if (n === 0) Object.assign(state, { color: FG, bold: false, dim: false });
      else if (n === 1) state.bold = true;
      else if (n === 2) state.dim = true;
      else if (n === 22) Object.assign(state, { bold: false, dim: false });
      else if (n === 39) state.color = FG;
      else if (PALETTE[n]) state.color = PALETTE[n];
    }
  }
  return runs;
}

/**
 * @param {string} output - ANSI-coloured text
 * @param {string} title - shown in the window bar
 * @returns {string} SVG markup
 */
function renderSvg(output, title) {
  const lines = output.split('\n');
  const plainWidth = Math.max(...lines.map(l => [...l.replace(/\x1b\[[0-9;]*m/g, '')].length), 40);
  const width = Math.ceil(plainWidth * CHAR_W + PAD * 2);
  const height = TOP + lines.length * LINE_H + PAD;
  const rows = lines.map((line, i) => {
    const spans = toRuns(line).map(run => {
      const attrs = [`fill="${run.color}"`, run.bold ? 'font-weight="700"' : '', run.dim ? 'fill-opacity="0.55"' : ''].filter(Boolean).join(' ');
      return `<tspan ${attrs}>${escapeXml(run.text)}</tspan>`;
    }).join('');
    return `<text x="${PAD}" y="${TOP + (i + 1) * LINE_H - 6}" xml:space="preserve">${spans}</text>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    `<rect width="${width}" height="${height}" rx="10" fill="${BG}"/>`,
    '<circle cx="22" cy="20" r="6" fill="#ff5f57"/><circle cx="42" cy="20" r="6" fill="#febc2e"/><circle cx="62" cy="20" r="6" fill="#28c840"/>',
    `<text x="${width / 2}" y="24" text-anchor="middle" fill="${FG}" fill-opacity="0.6" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12">${escapeXml(title)}</text>`,
    `<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14">`,
    ...rows,
    '</g>',
    '</svg>',
    ''
  ].join('\n');
}

if (require.main === module) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['status'];
  const examples = runExamples({ color: true });
  const output = names.map(name => `$ npx repocanon ${name}\n${examples[name]}`).join('\n\n');
  process.stdout.write(renderSvg(output, 'repocanon'));
}

module.exports = { renderSvg, toRuns };
