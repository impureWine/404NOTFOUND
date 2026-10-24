import assert from 'node:assert/strict';
import test from 'node:test';

import { NamingCard } from '../../src/ai/naming-card-router.js';

test('naming card routes listening and organizing needs to companion mode', () => {
  const listen = NamingCard.select({ emotionWords: ['疲惫'], need: 'LISTEN' });
  const organize = NamingCard.select({ emotionWords: ['烦躁'], need: 'ORGANIZE' });

  assert.deepEqual(listen, {
    targetMode: 'COMPANION',
    emotionWords: ['疲惫'],
    requiresQuestion: false,
  });
  assert.equal(organize.targetMode, 'COMPANION');
});

test('naming card routes search need to clarification before querying', () => {
  assert.deepEqual(
    NamingCard.select({ emotionWords: ['担心'], need: 'SEARCH' }),
    {
      targetMode: 'SEARCH',
      emotionWords: ['担心'],
      requiresQuestion: true,
    },
  );
});

test('naming card does not route before the user selects a need', () => {
  assert.equal(
    NamingCard.select({ emotionWords: ['说不清'] }).targetMode,
    null,
  );
});

test('naming card rejects duplicate or unknown selections', () => {
  assert.throws(
    () => NamingCard.select({ emotionWords: ['疲惫', '疲惫'], need: 'LISTEN' }),
    /Invalid naming card selection/,
  );
  assert.throws(
    () => NamingCard.select({ emotionWords: ['疲惫'], need: 'DIAGNOSE' }),
    /Invalid naming card selection/,
  );
});
