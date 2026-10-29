// Reads the two payloads this extension asks NotebookLM for. Positions follow
// the web app's replies as recorded; every read checks its shape, and a
// payload in an unexpected shape throws rather than reading as "no sources".

import { WireError } from './wire.js';

// A source's processing state, at source[3][1].
const STATUS = { processing: 1, ready: 2, error: 3, preparing: 5 };

// A source's kind, at metadata[4]. Only used to word the file's header.
const KINDS = {
  1: 'Google Docs',
  2: 'Google Slides',
  3: 'PDF',
  4: 'Text',
  5: 'Web page',
  6: 'PowerPoint',
  7: 'Google Sheets',
  8: 'Markdown',
  9: 'YouTube',
  10: 'Audio or video',
  11: 'Word document',
  12: 'Excel',
  13: 'Image',
  14: 'Google Drive',
  16: 'CSV',
  17: 'EPUB',
};

// GET_NOTEBOOK → { title, sources: [{ id, title, kind, url, status }], unreadable }
// where unreadable counts listed rows that carry no usable source id.
export function readNotebook(result) {
  const project = Array.isArray(result) ? result[0] : null;
  if (!Array.isArray(project)) throw new WireError('NotebookLM described this notebook in an unexpected way.');

  // The web app's own titles sometimes carry a stray "thought\n" prefix.
  const title = typeof project[0] === 'string' ? project[0].replace('thought\n', '').trim() : '';
  const rows = project[1];
  // An empty notebook has null where its source list goes.
  if (rows == null) return { title, sources: [], unreadable: 0 };
  if (!Array.isArray(rows)) throw new WireError('NotebookLM listed this notebook’s sources in an unexpected way.');

  const sources = [];
  const seen = new Set();
  let unreadable = 0;
  for (const row of rows) {
    const source = readSourceRow(row);
    if (!source) {
      unreadable++;
      continue;
    }
    // The list can repeat a source; the first copy is the real one.
    if (seen.has(source.id)) continue;
    seen.add(source.id);
    sources.push(source);
  }
  return { title, sources, unreadable };
}

// GET_SOURCE → { title, kind, url, body } where body is the document tree's
// list of blocks, or null when NotebookLM holds no text for the source.
export function readSource(result) {
  if (!Array.isArray(result)) throw new WireError('NotebookLM described this source in an unexpected way.');
  const descriptor = readSourceRow(result[0]);
  const doc = result[3];
  const content = Array.isArray(doc) && Array.isArray(doc[0]) ? doc[0][0] : null;
  return {
    title: descriptor?.title ?? '',
    kind: descriptor?.kind ?? null,
    url: descriptor?.url ?? null,
    body: Array.isArray(content) ? content : null,
  };
}

export function isReady(source) {
  return source.status === STATUS.ready;
}

// Why a source that is not ready cannot be saved, in the user's words.
export function notReadyReason(source) {
  switch (source.status) {
    case STATUS.processing:
    case STATUS.preparing:
      return 'NotebookLM is still processing it';
    case STATUS.error:
      return 'NotebookLM could not import it';
    default:
      return 'NotebookLM has not finished with it';
  }
}

// One source row: [idEnvelope, title, metadata, settings, ...]
function readSourceRow(row) {
  if (!Array.isArray(row)) return null;
  const id = idOf(row[0]);
  if (!id) return null;
  const metadata = Array.isArray(row[2]) ? row[2] : [];
  const settings = Array.isArray(row[3]) ? row[3] : [];
  return {
    id,
    title: typeof row[1] === 'string' ? row[1] : '',
    kind: KINDS[metadata[4]] ?? null,
    url: urlOf(metadata),
    status: typeof settings[1] === 'number' ? settings[1] : null,
  };
}

// "id", ["id"], or, for Drive files, [null, true, ["id"]].
function idOf(envelope) {
  if (typeof envelope === 'string') return envelope;
  if (!Array.isArray(envelope)) return null;
  if (typeof envelope[0] === 'string') return envelope[0];
  if (Array.isArray(envelope[2]) && typeof envelope[2][0] === 'string') return envelope[2][0];
  return null;
}

// The page's address at metadata[7][0], else a YouTube link at metadata[5][0].
function urlOf(metadata) {
  for (const slot of [metadata[7], metadata[5]]) {
    if (Array.isArray(slot) && typeof slot[0] === 'string' && /^https?:\/\//.test(slot[0])) return slot[0];
  }
  return null;
}
