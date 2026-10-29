import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { callInPage } from '../extension/lib/page.js';

// Chrome copies the function's source into the page, so it is tested the same
// way: rebuilt from its source alone, with nothing of this module around it.
const isolated = new Function(`return (${callInPage.toString()})`)();

function fakePage({ session, search = '', lang = 'fr', respond }) {
  const requests = [];
  Object.assign(globalThis, {
    window: { WIZ_global_data: session },
    document: { documentElement: { lang } },
    location: { search },
    fetch: async (url, init) => {
      requests.push({ url, init });
      return respond();
    },
  });
  return requests;
}

const SESSION = { SNlM0e: 'csrf-token', FdrFJe: 'session-id', cfb2h: 'boq-build' };
const originalFetch = globalThis.fetch;

afterEach(() => {
  for (const name of ['window', 'document', 'location']) delete globalThis[name];
  globalThis.fetch = originalFetch;
});

test('the call carries the page’s session the way the web app’s own calls do', async () => {
  const requests = fakePage({
    session: SESSION,
    search: '?authuser=1',
    respond: () => ({ status: 200, text: async () => 'reply' }),
  });
  const reply = await isolated('/_/LabsTailwindUi/data/batchexecute', { rpcids: 'rLM1Ne', rt: 'c' }, '[[["rLM1Ne","[]",null,"generic"]]]');
  assert.deepEqual(reply, { status: 200, text: 'reply' });

  const [{ url, init }] = requests;
  const query = new URL(url, 'https://notebooklm.google.com').searchParams;
  assert.equal(query.get('rpcids'), 'rLM1Ne');
  assert.equal(query.get('f.sid'), 'session-id');
  assert.equal(query.get('bl'), 'boq-build');
  assert.equal(query.get('hl'), 'fr');
  assert.equal(query.get('authuser'), '1');
  assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'include');
  const form = new URLSearchParams(init.body);
  assert.equal(form.get('f.req'), '[[["rLM1Ne","[]",null,"generic"]]]');
  assert.equal(form.get('at'), 'csrf-token');
});

test('without a session token the page is signed out, and nothing is sent', async () => {
  const requests = fakePage({ session: undefined, respond: () => assert.fail('nothing should be sent') });
  assert.deepEqual(await isolated('/x', {}, '[]'), { signedOut: true });
  assert.equal(requests.length, 0);
});

test('a failed connection is reported, not thrown', async () => {
  fakePage({
    session: SESSION,
    respond: () => {
      throw new TypeError('Failed to fetch');
    },
  });
  assert.deepEqual(await isolated('/x', {}, '[]'), { networkError: 'Failed to fetch' });
});
