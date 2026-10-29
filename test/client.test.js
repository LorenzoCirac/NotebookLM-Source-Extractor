import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { FatalError, internals, loadNotebook, whereIs } from '../extension/lib/client.js';
import { RPC, notebookParams } from '../extension/lib/wire.js';
import { notebookPayload, replyOf, sourceRow } from './helpers.js';

// A stand-in for chrome.scripting that answers each call with the next reply.
function fakeChrome(replies) {
  const calls = [];
  globalThis.chrome = {
    scripting: {
      async executeScript(options) {
        calls.push(options);
        const next = replies.shift();
        if (next instanceof Error) throw next;
        return [{ result: next }];
      },
    },
  };
  return calls;
}

afterEach(() => {
  delete globalThis.chrome;
});

const noWait = async () => {};
const call = (rpc = RPC.getNotebook) => internals.call(7, rpc, notebookParams('nb-1'), 'nb-1', noWait);

test('the call runs in the tab’s own page, with the request for it', async () => {
  const calls = fakeChrome([{ status: 200, text: replyOf('rLM1Ne', notebookPayload({ title: 'T', sources: [sourceRow({ id: 'a', title: 'A' })] })) }]);
  const notebook = await loadNotebook(7, 'nb-1');
  assert.equal(notebook.title, 'T');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].target, { tabId: 7 });
  assert.equal(calls[0].world, 'MAIN');
  assert.equal(calls[0].args[0], '/_/LabsTailwindUi/data/batchexecute');
  assert.equal(calls[0].args[1].rpcids, 'rLM1Ne');
});

test('a server hiccup is retried, then the answer is read', async () => {
  const calls = fakeChrome([{ status: 503, text: '' }, { networkError: 'Failed to fetch' }, { status: 200, text: replyOf('rLM1Ne', [1]) }]);
  assert.deepEqual(await call(), [1]);
  assert.equal(calls.length, 3);
});

test('a hiccup that persists costs only this call', async () => {
  fakeChrome([{ status: 500, text: '' }, { status: 500, text: '' }, { status: 500, text: '' }]);
  await assert.rejects(call(), (error) => !(error instanceof FatalError) && /HTTP 500/.test(error.message));
});

test('being signed out stops everything', async () => {
  fakeChrome([{ signedOut: true }]);
  await assert.rejects(call(), FatalError);
});

test('a refused session stops everything', async () => {
  for (const status of [400, 401, 403]) {
    fakeChrome([{ status, text: '' }]);
    await assert.rejects(call(), FatalError);
  }
});

test('a rate limit that does not lift stops everything', async () => {
  fakeChrome([{ status: 429 }, { status: 429 }, { status: 429 }]);
  await assert.rejects(call(), /pause/);
});

test('a tab that is gone stops everything', async () => {
  fakeChrome([new Error('No tab with id: 7')]);
  await assert.rejects(call(), FatalError);
});

test('NotebookLM is recognised on both its hosts, and so is the notebook', () => {
  assert.deepEqual(whereIs('https://notebooklm.google.com/notebook/0b1c-2d3e?authuser=1'), { site: true, notebookId: '0b1c-2d3e' });
  assert.deepEqual(whereIs('https://notebook.google.com/notebook/abc'), { site: true, notebookId: 'abc' });
  assert.deepEqual(whereIs('https://notebooklm.google.com/'), { site: true, notebookId: null });
  assert.deepEqual(whereIs('https://example.com/notebook/abc'), { site: false, notebookId: null });
  assert.deepEqual(whereIs('http://notebooklm.google.com/notebook/abc'), { site: false, notebookId: null });
  assert.deepEqual(whereIs(undefined), { site: false, notebookId: null });
});
