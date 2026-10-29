import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isReady, notReadyReason, readNotebook, readSource } from '../extension/lib/notebook.js';
import { decodeReply } from '../extension/lib/wire.js';
import { notebookPayload, para, replyOf, run, sourcePayload, sourceRow } from './helpers.js';

// Every reading goes through the wire, as the extension's own does.
const notebookFrom = (payload) => readNotebook(decodeReply(replyOf('rLM1Ne', payload), 'rLM1Ne'));
const sourceFrom = (payload) => readSource(decodeReply(replyOf('hizoJc', payload), 'hizoJc'));

test('a notebook reads as its title and sources, in order', () => {
  const notebook = notebookFrom(
    notebookPayload({
      title: 'Research',
      sources: [
        sourceRow({ id: 'a', title: 'A page', kind: 5, url: 'https://example.com/a' }),
        sourceRow({ id: 'b', title: 'Report.pdf', kind: 3 }),
      ],
    }),
  );
  assert.equal(notebook.title, 'Research');
  assert.equal(notebook.unreadable, 0);
  assert.deepEqual(notebook.sources, [
    { id: 'a', title: 'A page', kind: 'Web page', url: 'https://example.com/a', status: 2 },
    { id: 'b', title: 'Report.pdf', kind: 'PDF', url: null, status: 2 },
  ]);
});

test('an empty notebook has no sources', () => {
  // The recorded empty notebook has null where the list goes.
  assert.deepEqual(notebookFrom(notebookPayload({ title: 'Empty', sources: null })), {
    title: 'Empty',
    sources: [],
    unreadable: 0,
  });
});

test('every id envelope is read: bare, wrapped, and Drive', () => {
  const notebook = notebookFrom(
    notebookPayload({
      title: 'Ids',
      sources: [
        sourceRow({ title: 'bare', envelope: 'id-1' }),
        sourceRow({ title: 'wrapped', envelope: ['id-2'] }),
        sourceRow({ title: 'drive', envelope: [null, true, ['id-3']] }),
      ],
    }),
  );
  assert.deepEqual(
    notebook.sources.map((source) => source.id),
    ['id-1', 'id-2', 'id-3'],
  );
});

test('a YouTube source takes its link from the YouTube slot', () => {
  const notebook = notebookFrom(
    notebookPayload({ title: 'Video', sources: [sourceRow({ id: 'v', title: 'Talk', kind: 9, youtube: 'https://youtu.be/x' })] }),
  );
  assert.equal(notebook.sources[0].url, 'https://youtu.be/x');
  assert.equal(notebook.sources[0].kind, 'YouTube');
});

test('a repeated source is listed once', () => {
  const row = sourceRow({ id: 'a', title: 'A' });
  assert.equal(notebookFrom(notebookPayload({ title: 'T', sources: [row, row] })).sources.length, 1);
});

test('a row without an id is counted, not silently dropped', () => {
  const notebook = notebookFrom(notebookPayload({ title: 'T', sources: [sourceRow({ id: 'a', title: 'A' }), [null, 'x'], 'junk'] }));
  assert.equal(notebook.sources.length, 1);
  assert.equal(notebook.unreadable, 2);
});

test('the stray "thought" prefix on a title is dropped', () => {
  assert.equal(notebookFrom(notebookPayload({ title: 'thought\nMy notes', sources: null })).title, 'My notes');
});

test('a notebook in an unexpected shape throws instead of reading as empty', () => {
  assert.throws(() => readNotebook(null));
  assert.throws(() => readNotebook(['not a project']));
  assert.throws(() => readNotebook([['Title', 'not a list']]));
});

test('a source reads as its descriptor and document body', () => {
  const elements = [para([run('Hello')])];
  const source = sourceFrom(sourcePayload({ title: 'Page', url: 'https://example.com', elements }));
  assert.equal(source.title, 'Page');
  assert.equal(source.kind, 'Web page');
  assert.equal(source.url, 'https://example.com');
  assert.deepEqual(source.body, elements);
});

test('a source without text has a null body', () => {
  assert.equal(sourceFrom(sourcePayload({ title: 'Image', kind: 13, elements: null })).body, null);
});

test('only a ready source is read; the others say why', () => {
  assert.equal(isReady({ status: 2 }), true);
  assert.equal(isReady({ status: 1 }), false);
  assert.match(notReadyReason({ status: 1 }), /still processing/);
  assert.match(notReadyReason({ status: 5 }), /still processing/);
  assert.match(notReadyReason({ status: 3 }), /could not import/);
  assert.match(notReadyReason({ status: null }), /not finished/);
});
