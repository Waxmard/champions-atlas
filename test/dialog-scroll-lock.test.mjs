import assert from 'node:assert/strict';
import test from 'node:test';
import { lockBodyScroll } from '../src/lib/dialog-scroll-lock.ts';

test('releasing the lock clears an overflow left on the body by a closing menu', () => {
  const style = {
    position: '',
    top: '',
    left: '',
    width: '',
    overflow: 'hidden',
  };
  let scrolledTo;
  globalThis.window = {
    scrollX: 0,
    scrollY: 120,
    scrollTo: (...position) => (scrolledTo = position),
  };
  globalThis.document = { body: { style } };

  lockBodyScroll()();

  assert.deepEqual(style, {
    position: '',
    top: '',
    left: '',
    width: '',
    overflow: '',
  });
  assert.deepEqual(scrolledTo, [0, 120]);
});
