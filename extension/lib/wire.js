// NotebookLM's web app talks to its backend through Google's "batchexecute"
// endpoint: one POST per call, the call named by an obfuscated id, its
// arguments a JSON array, and the reply a chunked stream of JSON frames.
// This module builds those requests and reads those replies, nothing else.

export const ENDPOINT = '/_/LabsTailwindUi/data/batchexecute';

// The two calls this extension makes. Both are read-only.
export const RPC = {
  getNotebook: 'rLM1Ne', // the notebook: title and source list
  getSource: 'hizoJc', // one source: its descriptor and full text
};

// The request-options block the web app sends with notebook reads.
const OPTIONS = [2, null, null, [1, null, null, null, null, null, null, null, null, null, [1]]];

export function notebookParams(notebookId) {
  return [notebookId, null, OPTIONS, null, 0];
}

// `[2], [2]` asks for the source's text as a structured document tree.
export function sourceParams(sourceId) {
  return [[sourceId], [2], [2]];
}

// What the page script needs to send one call. The session tokens are added
// in the page, which is the only place they exist.
export function request(rpcId, params, notebookId) {
  return {
    query: { rpcids: rpcId, 'source-path': `/notebook/${notebookId}`, rt: 'c' },
    fReq: JSON.stringify([[[rpcId, JSON.stringify(params), null, 'generic']]]),
  };
}

export class WireError extends Error {}

// Reads a reply and returns the call's result: the parsed JSON payload, or
// null when NotebookLM answered with nothing. Throws a WireError when the
// reply is not one this module understands, so a changed format is reported
// rather than mistaken for an empty notebook.
export function decodeReply(text, rpcId) {
  const frames = framesOf(text);
  if (frames.length === 0) throw new WireError('NotebookLM sent a reply this extension cannot read.');

  let found = false;
  let result = null;
  for (const frame of frames) {
    if (!Array.isArray(frame) || frame[1] !== rpcId) continue;
    if (frame[0] === 'er') {
      throw new WireError(`NotebookLM refused the request (error ${JSON.stringify(frame[2] ?? null)}).`);
    }
    if (frame[0] !== 'wrb.fr') continue;
    found = true;
    const payload = frame[2];
    if (payload == null) {
      // A null payload with error details beside it is a refusal (a rate
      // limit, a missing source), not an empty answer.
      if (frame[5] != null) {
        throw new WireError(`NotebookLM refused the request (${JSON.stringify(frame[5])}).`);
      }
      continue;
    }
    // The stream can carry a placeholder frame before the real one: the last
    // populated frame wins.
    result = typeof payload === 'string' ? parseJson(payload) : payload;
  }
  if (!found) throw new WireError(`NotebookLM's reply did not answer the request (${rpcId}).`);
  return result;
}

// The reply opens with an anti-XSSI line, then alternates a length line and a
// JSON line. Every JSON line holds an array of frames.
function framesOf(text) {
  const frames = [];
  const body = String(text).replace(/^\)\]\}'\r?\n/, '');
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('[')) continue;
    const chunk = parseJson(trimmed);
    if (!Array.isArray(chunk)) continue;
    // A chunk is usually a list of frames, occasionally a single bare frame.
    if (Array.isArray(chunk[0])) frames.push(...chunk);
    else frames.push(chunk);
  }
  return frames;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new WireError('NotebookLM sent a reply this extension cannot read.');
  }
}
