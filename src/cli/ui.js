'use strict';

/**
 * Terminal output kit: one look for every command.
 *
 * Shape of a command's output: header → sections of aligned rows → verdict → next steps.
 * Colour is decoration only: every state also has a symbol and a word, so output stays
 * readable piped, in CI logs, with NO_COLOR and for screen readers.
 */

const ANSI = /\x1b\[[0-9;]*m/g;
const CODES = { bold: [1, 22], dim: [2, 22], red: [31, 39], green: [32, 39], yellow: [33, 39], cyan: [36, 39] };

/**
 * @param {string} text
 * @returns {string} text without ANSI colour codes
 */
const strip = text => String(text).replace(ANSI, '');
const width = text => [...strip(text)].length;

/**
 * Whether to colour: FORCE_COLOR wins, then --no-color / NO_COLOR / TERM=dumb, then TTY.
 *
 * @param {{ isTTY?: boolean }} stream
 * @param {{ noColor?: boolean, env?: Record<string, string|undefined> }} [options={}]
 * @returns {boolean}
 */
function shouldColor(stream, options = {}) {
  const env = options.env || process.env;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true;
  if (options.noColor || env.NO_COLOR !== undefined || env.TERM === 'dumb') return false;
  return Boolean(stream && stream.isTTY);
}

/**
 * Whether the terminal can draw ◆ ✓ █. Old Windows consoles and TERM=dumb can't.
 *
 * @param {{ env?: Record<string, string|undefined>, platform?: string }} [options={}]
 * @returns {boolean}
 */
function shouldUseUnicode(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  if (env.TERM === 'dumb') return false;
  if (platform !== 'win32') return true;
  return Boolean(env.WT_SESSION || env.TERM_PROGRAM === 'vscode' || env.ConEmuTask || env.TERMINUS_SUBLIME);
}

/**
 * @param {{ stream?: NodeJS.WriteStream, color?: boolean, unicode?: boolean, columns?: number }} [options={}]
 */
function createUi(options = {}) {
  const stream = options.stream || process.stdout;
  const color = options.color !== undefined ? options.color : shouldColor(stream);
  const unicode = options.unicode !== undefined ? options.unicode : shouldUseUnicode();
  // Truncate long details only in an interactive terminal; logs keep every character
  const columns = options.columns !== undefined ? options.columns : (stream.isTTY && stream.columns) || 0;

  const paint = name => text => (color ? `\x1b[${CODES[name][0]}m${text}\x1b[${CODES[name][1]}m` : String(text));
  const c = Object.fromEntries(Object.keys(CODES).map(name => [name, paint(name)]));

  const glyph = unicode
    ? { ok: '✓', warn: '!', error: '✗', info: 'i', same: '·', mark: '◆', arrow: '→', full: '█', empty: '░', more: '…' }
    : { ok: 'ok', warn: '!!', error: 'x', info: 'i', same: '-', mark: '*', arrow: '->', full: '#', empty: '-', more: '...' };

  /** Result symbols, each with its colour. */
  const symbol = {
    ok: c.green(glyph.ok),
    warn: c.yellow(glyph.warn),
    error: c.red(glyph.error),
    info: c.cyan(glyph.info),
    same: c.dim(glyph.same)
  };

  /** File actions: symbol + the one word used for it everywhere. */
  const ACTIONS = {
    create: [c.green('+'), 'created'],
    add: [c.green('+'), 'added'],
    update: [c.yellow('~'), 'updated'],
    remove: [c.red('-'), 'removed'],
    unchanged: [c.dim('='), 'unchanged'],
    keep: [c.dim('='), 'kept'],
    kept: [c.dim('='), 'kept'],
    conflict: [c.yellow('!'), 'left alone'],
    invalid: [c.yellow('!'), 'skipped'],
    manual: [c.yellow('!'), 'do it yourself']
  };

  const lines = [];
  const out = text => {
    lines.push(text);
    stream.write(`${text}\n`);
  };

  const fit = (text, room) => {
    if (!columns || room <= 0 || width(text) <= room) return text;
    const plain = [...strip(text)];
    return `${plain.slice(0, Math.max(0, room - 1)).join('')}${glyph.more}`;
  };

  return {
    c,
    color,
    unicode,
    glyph,
    symbol,
    strip,
    width,
    lines,

    /** Prints a raw line. */
    line(text = '') {
      out(text);
    },

    /** `◆ repocanon <command> · <project>` */
    header(command, project) {
      out(`${c.cyan(glyph.mark)} ${c.bold(`repocanon ${command}`)}${project ? c.dim(` · ${project}`) : ''}`);
      out('');
    },

    /** A bold section title, preceded by a blank line unless it is the first thing printed after the header. */
    section(title, count) {
      if (lines.length && lines[lines.length - 1] !== '') out('');
      out(`${c.bold(title)}${count !== undefined ? c.dim(` (${count})`) : ''}`);
    },

    /** `  ✓ text  detail` */
    row(sym, text, detail = '') {
      this.rows([[sym, text, detail]]);
    },

    /** A file action row: `  + path  created` */
    action(kind, file, note = '') {
      this.actions([[kind, file, note]]);
    },

    /**
     * Aligned result rows.
     *
     * @param {Array<[string, string, string?]>} list - [symbol, text, detail]
     */
    rows(list) {
      if (!list.length) return;
      this.table(list.map(([sym, text, detail]) => [sym, text, detail ? c.dim(detail) : '']));
    },

    /**
     * Aligned file actions.
     *
     * @param {Array<[string, string, string?]>} list - [action, file, note]
     */
    actions(list) {
      this.rows(list.map(([kind, file, note]) => {
        const [sym, word] = ACTIONS[kind] || [c.dim('*'), kind];
        return [sym, file, note ? `${word} · ${note}` : word];
      }));
    },

    /** Indented, dim block (snippets to paste, long details). */
    block(text) {
      for (const lineText of String(text).split('\n')) out(`      ${c.dim(lineText)}`);
    },

    /**
     * Aligned columns. `rows` are arrays of cell strings (colour allowed).
     *
     * @param {Array<Array<string>>} rows
     * @param {{ indent?: number, head?: string[] }} [opts={}]
     */
    table(rows, opts = {}) {
      const all = opts.head ? [opts.head.map(h => c.dim(h)), ...rows] : rows;
      const widths = [];
      for (const cells of all) cells.forEach((cell, i) => { widths[i] = Math.max(widths[i] || 0, width(cell)); });
      const pad = ' '.repeat(opts.indent === undefined ? 2 : opts.indent);
      for (const cells of all) {
        const text = cells.map((cell, i) => (i === cells.length - 1 ? cell : cell + ' '.repeat(widths[i] - width(cell)))).join('  ');
        out(`${pad}${columns ? fit(text, columns - pad.length) : text}`.trimEnd());
      }
    },

    /** `Freshness ████████░░ 82/100` */
    meter(label, score, max = 100) {
      if (score === null || score === undefined) {
        out(`${c.bold(label)} ${c.dim('n/a — needs git and at least one doc')}`);
        return;
      }
      const cells = 10;
      const filled = Math.round((score / max) * cells);
      const tint = score >= 80 ? c.green : score >= 50 ? c.yellow : c.red;
      out(`${c.bold(label)} ${tint(glyph.full.repeat(filled))}${c.dim(glyph.empty.repeat(cells - filled))} ${tint(`${score}/${max}`)}`);
    },

    /**
     * The one-line outcome.
     *
     * @param {{ errors?: number, warnings?: number, ok?: string, extra?: string, errorText?: string, warningText?: string }} counts
     *   errorText / warningText replace "N errors" / "N warnings" with words that fit the command
     */
    verdict({ errors = 0, warnings = 0, ok = 'All good', extra = '', errorText = '', warningText = '' }) {
      if (lines.length && lines[lines.length - 1] !== '') out('');
      const parts = [];
      if (errors) parts.push(errorText || `${errors} error${errors === 1 ? '' : 's'}`);
      if (warnings) parts.push(warningText || `${warnings} warning${warnings === 1 ? '' : 's'}`);
      const tail = extra ? c.dim(` · ${extra}`) : '';
      if (errors) out(`${symbol.error} ${c.red(c.bold(parts.join(', ')))}${tail}`);
      else if (warnings) out(`${symbol.warn} ${c.yellow(c.bold(parts.join(', ')))}${tail}`);
      else out(`${symbol.ok} ${c.green(c.bold(ok))}${tail}`);
    },

    /**
     * What to do now: commands in cyan, why in dim.
     *
     * @param {Array<[string, string]>} steps
     */
    next(steps) {
      const list = steps.filter(Boolean);
      if (!list.length) return;
      if (lines.length && lines[lines.length - 1] !== '') out('');
      out(c.bold('Next'));
      const cmdWidth = Math.max(...list.map(([cmd]) => width(cmd)));
      for (const [cmd, why] of list) {
        out(`  ${c.cyan(cmd)}${why ? `${' '.repeat(cmdWidth - width(cmd))}  ${c.dim(why)}` : ''}`);
      }
    },

    /** A dim one-liner, e.g. a hint under a verdict. */
    hint(text) {
      out(`  ${c.dim(`${glyph.arrow} ${text}`)}`);
    }
  };
}

let defaultUi = null;

/**
 * The ui for stdout, configured once from flags (`--no-color`) and the environment.
 *
 * @param {{ noColor?: boolean }} [options={}]
 * @returns {ReturnType<typeof createUi>}
 */
function getUi(options = {}) {
  if (!defaultUi || options.noColor !== undefined) {
    defaultUi = createUi({ color: shouldColor(process.stdout, options) });
  }
  return defaultUi;
}

/**
 * A ui for stderr (status lines next to machine output on stdout, errors).
 *
 * @param {{ noColor?: boolean }} [options={}]
 */
function getErrorUi(options = {}) {
  return createUi({ stream: process.stderr, color: shouldColor(process.stderr, options) });
}

module.exports = { createUi, getUi, getErrorUi, shouldColor, shouldUseUnicode, strip };
