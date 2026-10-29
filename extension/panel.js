import { FatalError, loadNotebook, loadSource, whereIs } from './lib/client.js';
import { asciiPath, countOf, fileNames, folderName, notebookDocument, sourceDocument } from './lib/files.js';
import { gather } from './lib/gather.js';
import { isReady } from './lib/notebook.js';

const $ = (id) => document.getElementById(id);

let windowId = null;
let current = null; // { tabId, notebookId, title, sources, unreadable }
let running = false;
let looking = 0; // bumps on each look, so a slow, stale answer is dropped
let shownDownload = null;

// ---- What the card says ----------------------------------------------------

function card({ eyebrow = 'Notebook', title, detail = '', error = false, openSite = false, retry = false }) {
  $('eyebrow').textContent = eyebrow;
  $('title').textContent = title;
  $('detail').textContent = detail;
  $('title').closest('.card').classList.toggle('error', error);
  $('open-site').hidden = !openSite;
  $('retry').hidden = !retry;
}

function choices(enabled) {
  $('choices').hidden = false;
  $('separate').disabled = !enabled;
  $('combined').disabled = !enabled;
}

function sourcesLine(notebook) {
  const total = notebook.sources.length;
  if (total === 0) return 'No sources yet.';
  const waiting = notebook.sources.filter((source) => !isReady(source)).length;
  return waiting ? `${countOf(total, 'source')}, ${waiting} still processing` : countOf(total, 'source');
}

// ---- Following the active tab --------------------------------------------

// again: look even if the tab still shows the notebook the panel shows.
async function look({ again = false } = {}) {
  if (running) return;
  const ticket = ++looking;
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  const place = whereIs(tab?.url);
  if (ticket !== looking) return;
  // Moving around inside the same notebook changes nothing here.
  if (!again && current && tab?.id === current.tabId && place.notebookId === current.notebookId) return;

  current = null;
  $('result').hidden = true;
  $('progress').hidden = true;

  if (!place.site) {
    card({ eyebrow: 'No notebook open', title: 'Open a notebook in NotebookLM', detail: 'Its sources show up here.', openSite: true });
    return choices(false);
  }
  if (!place.notebookId) {
    card({ eyebrow: 'NotebookLM', title: 'Open one of your notebooks', detail: 'Its sources show up here.' });
    return choices(false);
  }

  card({ title: 'Reading the notebook…' });
  choices(false);
  try {
    const notebook = await loadNotebook(tab.id, place.notebookId);
    if (ticket !== looking) return;
    current = { tabId: tab.id, notebookId: place.notebookId, ...notebook };
    card({ title: notebook.title || 'Untitled notebook', detail: sourcesLine(notebook) });
    choices(notebook.sources.length > 0);
  } catch (error) {
    if (ticket !== looking) return;
    card({ eyebrow: 'Notebook', title: 'Could not read this notebook', detail: error.message, error: true, retry: true });
  }
}

// ---- Extracting ------------------------------------------------------------

async function extract(mode) {
  if (!current || running) return;
  running = true;
  const { tabId, notebookId } = current;
  choices(false);
  $('choices').hidden = true;
  $('result').hidden = true;
  $('progress').hidden = false;
  progress(0, 1, 'Reading the source list…');

  try {
    // The list again, in case sources were added since the panel looked.
    const notebook = await loadNotebook(tabId, notebookId);
    current = { tabId, notebookId, ...notebook };
    card({ title: notebook.title || 'Untitled notebook', detail: sourcesLine(notebook) });

    const { saved, skipped } = await gather(
      notebook,
      (source) => loadSource(tabId, notebookId, source.id),
      (done, total, title) => progress(done, total, `Read ${done} of ${total}: ${title || 'Untitled source'}`),
    );
    if (saved.length === 0) {
      finish({ text: 'Nothing to save: NotebookLM could not provide the text of any source.', skipped });
      return;
    }

    progress(1, 1, 'Saving…');
    const folder = folderName(notebook.title);
    if (mode === 'separate') {
      const names = fileNames(saved.map((source) => source.title));
      let first = null;
      for (const [i, source] of saved.entries()) {
        const id = await save(`${folder}/${names[i]}`, sourceDocument(source));
        first ??= id;
      }
      finish({ text: `Saved ${countOf(saved.length, 'file')} in the folder “${folder}” in your downloads.`, download: first, skipped });
    } else {
      const id = await save(`${folder}.md`, notebookDocument(notebook, saved, today()));
      finish({ text: `Saved ${countOf(saved.length, 'source')} in “${folder}.md” in your downloads.`, download: id, skipped });
    }
  } catch (error) {
    const fatal = error instanceof FatalError;
    finish({ text: fatal ? error.message : `Something went wrong: ${error.message}`, error: true });
  }
}

function progress(done, total, text) {
  $('bar').max = Math.max(total, 1);
  $('bar').value = done;
  $('progress-text').textContent = text;
}

function finish({ text, download = null, skipped = [], error = false }) {
  running = false;
  shownDownload = download;
  $('progress').hidden = true;
  $('result').hidden = false;
  $('result-text').textContent = text;
  $('result-text').style.color = error ? 'var(--danger)' : '';
  $('show').hidden = download == null;

  $('skipped').replaceChildren(
    ...skipped.map(({ title, reason }) => {
      const item = document.createElement('li');
      item.textContent = `${title || 'Untitled source'}: ${reason}`;
      return item;
    }),
  );
  $('skipped-summary').textContent = `${countOf(skipped.length, 'source')} skipped`;
  $('skipped-box').hidden = skipped.length === 0;
  $('skipped-box').open = skipped.length > 0 && skipped.length <= 5;
}

// ---- Saving ----------------------------------------------------------------

const blobUrls = new Map(); // download id → object URL, released once Chrome is done

async function save(filename, markdown) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const download = (name) => chrome.downloads.download({ url, filename: name, conflictAction: 'uniquify', saveAs: false });
  try {
    let id;
    try {
      id = await download(filename);
    } catch (error) {
      const ascii = asciiPath(filename);
      if (ascii === filename || !/invalid filename/i.test(error.message)) throw error;
      id = await download(ascii);
    }
    blobUrls.set(id, url);
    return id;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(`Chrome would not save “${filename}” (${error.message})`);
  }
}

chrome.downloads.onChanged.addListener((delta) => {
  const state = delta.state?.current;
  if (!state || state === 'in_progress' || !blobUrls.has(delta.id)) return;
  URL.revokeObjectURL(blobUrls.get(delta.id));
  blobUrls.delete(delta.id);
});

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---- Wiring ----------------------------------------------------------------

$('separate').addEventListener('click', () => extract('separate'));
$('combined').addEventListener('click', () => extract('combined'));
$('retry').addEventListener('click', () => look({ again: true }));
$('again').addEventListener('click', () => look({ again: true }));
$('open-site').addEventListener('click', () => chrome.tabs.create({ url: 'https://notebooklm.google.com/' }));
$('show').addEventListener('click', () => shownDownload != null && chrome.downloads.show(shownDownload));

chrome.tabs.onActivated.addListener((info) => {
  if (info.windowId === windowId) look();
});
chrome.tabs.onUpdated.addListener((_tabId, change, tab) => {
  if (tab.active && tab.windowId === windowId && (change.url || change.status === 'complete')) look();
});

chrome.windows.getCurrent().then((win) => {
  windowId = win.id;
  look();
});
