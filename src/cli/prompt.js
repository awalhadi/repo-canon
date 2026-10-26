'use strict';

const readline = require('readline');

/**
 * Key name (as readline's keypress reports it) → picker action.
 */
const KEY_ACTIONS = {
  up: 'up',
  k: 'up',
  down: 'down',
  j: 'down',
  space: 'toggle',
  a: 'all',
  return: 'done',
  enter: 'done',
  escape: 'cancel',
  q: 'cancel',
  cancel: 'cancel'
};

/**
 * True when both ends are a real terminal, so a key-driven picker can run.
 * Piped input, CI and editors' task runners get the non-interactive path instead.
 *
 * @returns {boolean}
 */
function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * @param {Array<{ id: string }>} items
 * @param {string[]} [selectedIds=[]]
 */
function createSelectState(items, selectedIds = []) {
  return {
    items,
    cursor: 0,
    selected: items.map(item => item.id).filter(id => selectedIds.includes(id)),
    done: false,
    cancelled: false
  };
}

/**
 * Pure state transition for the multi-select picker (no I/O, unit-tested).
 *
 * @param {ReturnType<typeof createSelectState>} state
 * @param {string} keyName - readline key name, or 'cancel' for Ctrl+C
 * @returns {ReturnType<typeof createSelectState>}
 */
function reduceSelection(state, keyName) {
  const count = state.items.length;
  const order = state.items.map(item => item.id);

  switch (KEY_ACTIONS[keyName]) {
    case 'up':
      return { ...state, cursor: (state.cursor - 1 + count) % count };
    case 'down':
      return { ...state, cursor: (state.cursor + 1) % count };
    case 'toggle': {
      const id = state.items[state.cursor].id;
      const next = state.selected.includes(id)
        ? state.selected.filter(s => s !== id)
        : [...state.selected, id];
      return { ...state, selected: order.filter(o => next.includes(o)) };
    }
    case 'all':
      return { ...state, selected: state.selected.length === count ? [] : order };
    case 'done':
      return { ...state, done: true };
    case 'cancel':
      return { ...state, cancelled: true };
    default:
      return state;
  }
}

/**
 * Renders the picker as text (pure, unit-tested).
 *
 * @param {ReturnType<typeof createSelectState>} state
 * @param {{ title: string, hint?: string, footer?: string, color?: boolean }} view
 *   items carry `label`, `detail` (what gets written) and an optional `note`
 * @returns {string}
 */
function renderMenu(state, view) {
  const paint = (code, text) => (view.color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const labelWidth = Math.max(...state.items.map(item => item.label.length));
  const detailWidth = Math.max(...state.items.map(item => (item.detail || '').length));

  const rows = state.items.map((item, index) => {
    const isCursor = index === state.cursor;
    const isChecked = state.selected.includes(item.id);
    const pointer = isCursor ? paint('36', '❯') : ' ';
    const box = isChecked ? paint('32', '[x]') : '[ ]';
    const label = item.label.padEnd(labelWidth);
    const detail = paint('2', (item.detail || '').padEnd(detailWidth));
    const note = item.note ? `  ${paint('33', item.note)}` : '';
    return `  ${pointer} ${box} ${isCursor ? paint('1', label) : label}  ${detail}${note}`.trimEnd();
  });

  return [
    paint('1', view.title),
    view.hint ? paint('2', view.hint) : null,
    '',
    ...rows,
    view.footer ? `\n${paint('2', view.footer)}` : null
  ]
    .filter(line => line !== null)
    .join('\n');
}

/**
 * Arrow-key multi-select in the terminal. Resolves the chosen ids in item order,
 * or null when cancelled (Esc, q, Ctrl+C). Always restores the terminal.
 *
 * @param {{ title: string, hint?: string, footer?: string,
 *           items: Array<{ id: string, label: string, detail?: string, note?: string }>,
 *           selected?: string[] }} options
 * @returns {Promise<string[]|null>}
 */
function multiSelect(options) {
  const input = process.stdin;
  const output = process.stdout;
  const view = { title: options.title, hint: options.hint, footer: options.footer, color: true };
  let state = createSelectState(options.items, options.selected);
  let drawnLines = 0;

  const draw = () => {
    if (drawnLines) {
      output.write(`\x1b[${drawnLines}A\x1b[0J`);
    }
    const text = renderMenu(state, view);
    output.write(`${text}\n`);
    drawnLines = text.split('\n').length;
  };

  return new Promise(resolve => {
    const wasRaw = input.isRaw;

    const finish = () => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      output.write(`\x1b[${drawnLines}A\x1b[0J\x1b[?25h`);
      if (state.cancelled) {
        resolve(null);
        return;
      }
      const chosen = state.items.filter(item => state.selected.includes(item.id));
      output.write(`${view.title}\n  ✔ ${chosen.map(item => item.label).join(', ') || 'none (AGENTS.md only)'}\n`);
      resolve(state.selected);
    };

    const onKeypress = (text, key = {}) => {
      const keyName = key.ctrl && key.name === 'c' ? 'cancel' : key.name || text;
      state = reduceSelection(state, keyName);
      if (state.done || state.cancelled) {
        finish();
      } else {
        draw();
      }
    };

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on('keypress', onKeypress);
    output.write('\x1b[?25l');
    draw();
  });
}

/**
 * Yes/no question; anything but y/yes is "no".
 *
 * @param {string} question
 * @returns {Promise<boolean>}
 */
function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${question} [y/N] `, answer => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

module.exports = {
  isInteractive,
  createSelectState,
  reduceSelection,
  renderMenu,
  multiSelect,
  confirm
};
