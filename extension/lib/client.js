// Asks the NotebookLM tab for a notebook or a source and reads the answer.

import { readNotebook, readSource } from './notebook.js';
import { callInPage } from './page.js';
import { ENDPOINT, RPC, decodeReply, notebookParams, request, sourceParams } from './wire.js';

// The hosts NotebookLM is served from: its own name, and Google's newer one.
const HOSTS = new Set(['notebooklm.google.com', 'notebook.google.com']);

// A failure that stops the whole extraction (signed out, tab gone), as opposed
// to one that only costs the source being read.
export class FatalError extends Error {}

// Where a tab is: on NotebookLM at all, and if so in which notebook.
export function whereIs(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { site: false, notebookId: null };
  }
  if (parsed.protocol !== 'https:' || !HOSTS.has(parsed.hostname)) return { site: false, notebookId: null };
  const match = parsed.pathname.match(/^\/notebook\/([\w-]+)/);
  return { site: true, notebookId: match ? match[1] : null };
}

export async function loadNotebook(tabId, notebookId) {
  return readNotebook(await call(tabId, RPC.getNotebook, notebookParams(notebookId), notebookId));
}

export async function loadSource(tabId, notebookId, sourceId) {
  const result = await call(tabId, RPC.getSource, sourceParams(sourceId), notebookId);
  if (result == null) throw new Error('NotebookLM sent nothing back for it');
  return readSource(result);
}

const RETRIES = 2;

async function call(tabId, rpcId, params, notebookId, wait = sleep) {
  const { query, fReq } = request(rpcId, params, notebookId);
  for (let attempt = 0; ; attempt++) {
    let reply;
    try {
      [{ result: reply }] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: callInPage,
        args: [ENDPOINT, query, fReq],
      });
    } catch {
      throw new FatalError('The NotebookLM tab was closed or reloaded. Open the notebook again and retry.');
    }
    if (!reply) throw new FatalError('The NotebookLM tab did not answer. Reload it and try again.');
    if (reply.signedOut) throw new FatalError('Sign in to NotebookLM in this tab, then try again.');

    // Network blips, rate limits and server hiccups pass; wait and retry.
    const passing = reply.networkError || reply.status === 429 || reply.status >= 500;
    if (passing && attempt < RETRIES) {
      await wait(1500 * (attempt + 1));
      continue;
    }
    if (reply.networkError) throw new Error(`the connection failed (${reply.networkError})`);
    if (reply.status === 429) throw new FatalError('NotebookLM asked for a pause. Wait a minute, then try again.');
    if (reply.status === 400 || reply.status === 401 || reply.status === 403) {
      throw new FatalError('NotebookLM turned the request down. Reload the NotebookLM tab and try again.');
    }
    if (reply.status !== 200) throw new Error(`NotebookLM answered with an error (HTTP ${reply.status})`);
    return decodeReply(reply.text, rpcId);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const internals = { call };
