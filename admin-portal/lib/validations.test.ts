import assert from 'node:assert/strict';
import test from 'node:test';

import { validateSSF } from './validations';

test('SSF validator requires exactly one letter followed by twelve digits', () => {
  assert.equal(validateSSF('K000000000000'), null);
  assert.notEqual(validateSSF('KK00000000000'), null);
  assert.notEqual(validateSSF('K00000000000'), null);
  assert.notEqual(validateSSF('000000000000'), null);
});
