import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../../web-prototype/games.html', import.meta.url), 'utf8');
const gameScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .find(script => script.includes('var marbleRuns'));

function createGameHarness() {
  const timers = new Map();
  const listeners = new Map();
  const elements = new Map();
  let nextTimer = 1;
  const getElement = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        textContent: '',
        className: '',
        style: {},
        attributes: {},
        classList: { toggle() {} },
        setAttribute(name, value) { this.attributes[name] = value; },
      });
    }
    return elements.get(id);
  };
  const document = {
    hidden: false,
    querySelector() {
      return { getTotalLength: () => 100, getPointAtLength: () => ({ x: 1, y: 1 }) };
    },
    querySelectorAll: () => [],
    getElementById: getElement,
    addEventListener(name, callback) { listeners.set(`document:${name}`, callback); },
  };
  const window = {
    addEventListener(name, callback) { listeners.set(`window:${name}`, callback); },
  };
  const setTimer = (kind, callback, delay) => {
    const id = nextTimer++;
    timers.set(id, { kind, callback, delay });
    return id;
  };
  const context = vm.createContext({
    document,
    window,
    Date,
    Math,
    parseFloat,
    setInterval: (callback, delay) => setTimer('interval', callback, delay),
    setTimeout: (callback, delay) => setTimer('timeout', callback, delay),
    clearInterval: id => timers.delete(id),
    clearTimeout: id => timers.delete(id),
  });

  assert.ok(gameScript, 'games.html has an inline game controller');
  vm.runInContext(gameScript, context);
  return { context, document, listeners, timers };
}

test('switching away from the marble panel clears motion and elapsed-time intervals', () => {
  const game = createGameHarness();

  game.context.toggleMarble();
  assert.equal(game.timers.size, 2);
  game.context.showGame('breath');

  assert.equal(game.timers.size, 0);
  assert.equal(game.context.marbleTimer, null);
  assert.equal(game.context.marbleTick, null);
});

test('hiding the page pauses marble and breathing timers without auto-resume', () => {
  const game = createGameHarness();
  game.context.toggleMarble();
  game.context.toggleBreath();
  assert.equal(game.timers.size, 3);

  game.document.hidden = true;
  game.context.pauseForVisibilityChange();

  assert.equal(game.timers.size, 0);
  assert.equal(game.context.marbleTimer, null);
  assert.equal(game.context.marbleTick, null);
  assert.equal(game.context.breathRunning, false);
  assert.equal(game.context.breathTimer, null);
});

test('pagehide releases all outstanding game timers', () => {
  const game = createGameHarness();
  game.context.toggleMarble();
  game.context.toggleBreath();

  game.listeners.get('window:pagehide')();

  assert.equal(game.timers.size, 0);
  assert.equal(game.context.marbleTimer, null);
  assert.equal(game.context.marbleTick, null);
  assert.equal(game.context.breathTimer, null);
});
