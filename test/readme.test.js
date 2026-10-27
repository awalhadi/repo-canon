'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { runExamples } = require('../scripts/readme-examples');
const { toRuns, renderSvg } = require('../scripts/render-terminal-svg');

test('README: every "What you\'ll see" block is the real output of that command', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const blocks = [...readme.matchAll(/<!-- example:(\w+) -->\n```text\n([\s\S]*?)\n```/g)];
  assert.ok(blocks.length >= 5, 'README examples found');
  const examples = runExamples();
  for (const [, name, shown] of blocks) {
    assert.equal(shown, examples[name], `README example "${name}" is out of date: run node scripts/readme-examples.js and paste the new output`);
  }
});

test('terminal SVG: ANSI runs keep colour, bold and dim; the image is valid markup', () => {
  assert.deepEqual(toRuns('\x1b[1m\x1b[32mok\x1b[39m\x1b[22m plain'), [
    { text: 'ok', color: '#5fd38d', bold: true, dim: false },
    { text: ' plain', color: '#d7dae0', bold: false, dim: false }
  ]);
  const svg = renderSvg('\x1b[33m!\x1b[39m a <b> & c', 'demo');
  assert.match(svg, /^<svg [^>]*role="img"/);
  assert.match(svg, /&lt;b&gt; &amp; c/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'assets', 'terminal.svg')));
});
