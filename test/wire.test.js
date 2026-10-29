import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RPC, WireError, decodeReply, notebookParams, request, sourceParams } from '../extension/lib/wire.js';
import { replyOf, stream } from './helpers.js';

test('a notebook request is encoded as the web app sends it', () => {
  const { query, fReq } = request(RPC.getNotebook, notebookParams('nb-1'), 'nb-1');
  assert.deepEqual(query, { rpcids: 'rLM1Ne', 'source-path': '/notebook/nb-1', rt: 'c' });
  assert.equal(
    fReq,
    '[[["rLM1Ne","[\\"nb-1\\",null,[2,null,null,[1,null,null,null,null,null,null,null,null,null,[1]]],null,0]",null,"generic"]]]',
  );
});

test('a source request asks for the text as a document tree', () => {
  const { query, fReq } = request(RPC.getSource, sourceParams('src-1'), 'nb-1');
  assert.equal(query.rpcids, 'hizoJc');
  assert.equal(query['source-path'], '/notebook/nb-1');
  assert.equal(fReq, '[[["hizoJc","[[\\"src-1\\"],[2],[2]]",null,"generic"]]]');
});

test('a reply yields its payload', () => {
  assert.deepEqual(decodeReply(replyOf('rLM1Ne', [['Title', null, 'nb-1']]), 'rLM1Ne'), [['Title', null, 'nb-1']]);
});

test('Windows line endings are read too', () => {
  const text = replyOf('rLM1Ne', [1, 2]).replace(/\n/g, '\r\n');
  assert.deepEqual(decodeReply(text, 'rLM1Ne'), [1, 2]);
});

test('a placeholder frame does not hide the real answer after it', () => {
  const text = stream([
    [['wrb.fr', 'hizoJc', null, null, null, null, 'generic']],
    [['wrb.fr', 'hizoJc', '[["real"]]', null, null, null, 'generic']],
  ]);
  assert.deepEqual(decodeReply(text, 'hizoJc'), [['real']]);
});

test('an answer of nothing reads as null', () => {
  assert.equal(decodeReply(replyOf('hizoJc', null), 'hizoJc'), null);
});

test('an error frame is a refusal, not an empty answer', () => {
  const text = stream([[['er', 'hizoJc', 5]]]);
  assert.throws(() => decodeReply(text, 'hizoJc'), WireError);
});

test('an empty answer with error details is a refusal', () => {
  const text = stream([[['wrb.fr', 'hizoJc', null, null, null, [8], 'generic']]]);
  assert.throws(() => decodeReply(text, 'hizoJc'), /refused/);
});

test('a reply that answers another call is not mistaken for this one', () => {
  assert.throws(() => decodeReply(replyOf('rLM1Ne', [1]), 'hizoJc'), /did not answer/);
});

test('a reply that is not batchexecute at all is reported', () => {
  assert.throws(() => decodeReply('<!doctype html><title>Sign in</title>', 'rLM1Ne'), WireError);
  assert.throws(() => decodeReply(")]}'\n\n12\n[broken json", 'rLM1Ne'), WireError);
});
