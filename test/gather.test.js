import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FatalError } from '../extension/lib/client.js';
import { gather } from '../extension/lib/gather.js';
import { para, run } from './helpers.js';

const source = (id, status = 2) => ({ id, title: `Source ${id}`, kind: 'PDF', url: null, status });
const textOf = (id) => ({ title: `Source ${id}`, kind: 'PDF', url: null, body: [para([run(`Text of ${id}`)])] });
const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

test('every ready source is read and kept in notebook order, however the reads finish', async () => {
  const notebook = { sources: ['a', 'b', 'c', 'd', 'e'].map((id) => source(id)), unreadable: 0 };
  const delays = { a: 30, b: 5, c: 20, d: 1, e: 10 };
  const { saved, skipped } = await gather(notebook, (s) => later(delays[s.id], textOf(s.id)));
  assert.deepEqual(
    saved.map((s) => s.title),
    ['Source a', 'Source b', 'Source c', 'Source d', 'Source e'],
  );
  assert.deepEqual(skipped, []);
});

test('no more than three sources are read at once', async () => {
  let reading = 0;
  let most = 0;
  const notebook = { sources: Array.from({ length: 10 }, (_, i) => source(String(i))), unreadable: 0 };
  await gather(notebook, async (s) => {
    most = Math.max(most, ++reading);
    await later(2);
    reading--;
    return textOf(s.id);
  });
  assert.equal(most, 3);
});

test('progress is reported after each source', async () => {
  const seen = [];
  const notebook = { sources: [source('a'), source('b')], unreadable: 0 };
  await gather(notebook, async (s) => textOf(s.id), (done, total) => seen.push(`${done}/${total}`));
  assert.deepEqual(seen, ['1/2', '2/2']);
});

test('sources not ready, without text, or failing are skipped with the reason, in order', async () => {
  const notebook = { sources: [source('a', 1), source('b'), source('c'), source('d'), source('e', 3)], unreadable: 1 };
  const { saved, skipped } = await gather(notebook, async (s) => {
    if (s.id === 'b') return { ...textOf('b'), body: null };
    if (s.id === 'c') throw new Error('NotebookLM refused the request (error 5).');
    return textOf(s.id);
  });
  assert.deepEqual(
    saved.map((s) => s.title),
    ['Source d'],
  );
  assert.deepEqual(skipped, [
    { order: 0, title: 'Source a', reason: 'NotebookLM is still processing it' },
    { order: 1, title: 'Source b', reason: 'NotebookLM holds no text for it' },
    { order: 2, title: 'Source c', reason: 'NotebookLM refused the request (error 5)' },
    { order: 4, title: 'Source e', reason: 'NotebookLM could not import it' },
    { order: Infinity, title: '1 other source', reason: 'NotebookLM listed them in a way this extension cannot read' },
  ]);
});

test('a body that renders to nothing counts as no text', async () => {
  const notebook = { sources: [source('a')], unreadable: 0 };
  const { saved, skipped } = await gather(notebook, async () => ({ ...textOf('a'), body: [para([run('   ')])] }));
  assert.equal(saved.length, 0);
  assert.equal(skipped[0].reason, 'NotebookLM holds no text for it');
});

test('a fatal error stops the whole extraction', async () => {
  const notebook = { sources: Array.from({ length: 9 }, (_, i) => source(String(i))), unreadable: 0 };
  let reads = 0;
  await assert.rejects(
    gather(notebook, async () => {
      reads++;
      throw new FatalError('Sign in to NotebookLM in this tab, then try again.');
    }),
    FatalError,
  );
  assert.ok(reads <= 3, `stopped after the reads already under way, not ${reads}`);
});

test('the list’s title wins over the one on the source itself, which is the fallback', async () => {
  const notebook = { sources: [{ ...source('a'), title: '' }], unreadable: 0 };
  const { saved } = await gather(notebook, async () => ({ ...textOf('a'), title: 'From the source' }));
  assert.equal(saved[0].title, 'From the source');
});
