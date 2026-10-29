// Reads every source of a notebook, a few at a time, and sorts them into the
// ones to save and the ones skipped (with the reason), both in notebook order.

import { FatalError } from './client.js';
import { renderBody } from './markdown.js';
import { countOf } from './files.js';
import { isReady, notReadyReason } from './notebook.js';

const AT_ONCE = 3;

// load(source) resolves to { title, kind, url, body }; onProgress(done, total,
// title) follows along. A FatalError stops everything and is rethrown.
export async function gather(notebook, load, onProgress = () => {}) {
  const ready = [];
  const skipped = [];
  notebook.sources.forEach((source, order) => {
    if (isReady(source)) ready.push({ source, order });
    else skipped.push({ order, title: source.title, reason: notReadyReason(source) });
  });
  if (notebook.unreadable) {
    skipped.push({
      order: Infinity,
      title: countOf(notebook.unreadable, 'other source'),
      reason: 'NotebookLM listed them in a way this extension cannot read',
    });
  }

  const saved = [];
  let done = 0;
  let next = 0;
  let fatal = null;
  const worker = async () => {
    while (!fatal && next < ready.length) {
      const { source, order } = ready[next++];
      try {
        const full = await load(source);
        if (full.body && renderBody(full.body).trim()) {
          saved.push({
            order,
            title: source.title || full.title,
            kind: source.kind ?? full.kind,
            url: source.url ?? full.url,
            body: full.body,
          });
        } else {
          skipped.push({ order, title: source.title, reason: 'NotebookLM holds no text for it' });
        }
      } catch (error) {
        if (error instanceof FatalError) {
          fatal = error;
          return;
        }
        skipped.push({ order, title: source.title, reason: reasonOf(error) });
      }
      onProgress(++done, ready.length, source.title);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, ready.length) }, worker));
  if (fatal) throw fatal;

  const byOrder = (a, b) => a.order - b.order;
  return { saved: saved.sort(byOrder), skipped: skipped.sort(byOrder) };
}

function reasonOf(error) {
  return String(error?.message || error || 'it could not be read').replace(/\.$/, '');
}
