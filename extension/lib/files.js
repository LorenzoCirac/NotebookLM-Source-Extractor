// What gets written: the Markdown of each file and the names they are saved
// under.

import { renderBody } from './markdown.js';

// One source as its own file: the source's title, where it came from, then
// its text with its headings one level down.
export function sourceDocument(source) {
  return `${header(source, '#')}\n\n${renderBody(source.body, { headingOffset: 1 })}\n`;
}

// Every source in one file: the notebook's title, a list of what follows,
// then each source under its own heading, its headings two levels down.
export function notebookDocument(notebook, sources, savedOn) {
  const intro = [
    `# ${oneLine(notebook.title) || 'Untitled notebook'}`,
    `${countOf(sources.length, 'source')} from NotebookLM, saved ${savedOn}.`,
    sources.map((source, i) => `${i + 1}. ${oneLine(source.title) || 'Untitled source'}`).join('\n'),
  ].join('\n\n');
  const parts = sources.map((source) => `${header(source, '##')}\n\n${renderBody(source.body, { headingOffset: 2 })}`);
  return `${[intro, ...parts].join('\n\n---\n\n')}\n`;
}

function header(source, marks) {
  const lines = [`${marks} ${oneLine(source.title) || 'Untitled source'}`];
  const about = [source.kind, source.url].filter(Boolean).join(' · ');
  if (about) lines.push('', `Source: ${about}`);
  return lines.join('\n');
}

export function countOf(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// File names, one per source, unique without regard to case (as Windows and
// macOS compare them), all ending in .md.
export function fileNames(titles) {
  const taken = new Set();
  return titles.map((title) => {
    const stem = safeName(stripExtension(nameFromUrl(title)), 'Untitled source');
    let name = `${stem}.md`;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem} (${n}).md`;
    taken.add(name.toLowerCase());
    return name;
  });
}

export function folderName(notebookTitle) {
  return safeName(notebookTitle, 'NotebookLM notebook', 60);
}

// A source added by its address is titled with it; the file is named after
// the page instead: "https://site.com/docs/guide.html" saves as "guide.md".
function nameFromUrl(title) {
  const text = String(title ?? '').trim();
  if (!/^https?:\/\/\S+$/i.test(text)) return text;
  try {
    const url = new URL(text);
    const last = url.pathname.split('/').filter(Boolean).at(-1);
    return last ? decodeURIComponent(last) : url.hostname;
  } catch {
    return text;
  }
}

// "Report.pdf" saves as "Report.md", not "Report.pdf.md".
function stripExtension(title) {
  return String(title ?? '').replace(
    /\.(pdf|docx?|pptx?|xlsx?|txt|md|markdown|csv|tsv|epub|rtf|odt|html?|mp3|wav|m4a|mp4|png|jpe?g|gif|webp)$/i,
    '',
  );
}

// A name every common file system accepts and Chrome's download API allows:
// no path separators, reserved or invisible characters, no leading or
// trailing dots or spaces, no device names, and short enough that the folder
// and file together stay inside Windows' 260-character path limit.
export function safeName(text, fallback, maxLength = 100) {
  let name = String(text ?? '')
    .replace(/\s*:\s+/g, ' - ')
    .replace(/[\\/|:]/g, '-')
    .replace(/"/g, "'")
    .replace(/[<>*?~]/g, '')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  name = cut(name, maxLength).replace(/^[\s.]+|[\s.]+$/g, '');
  if (!name) return fallback;
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) name = `_${name}`;
  return name;
}

// The same path in plain ASCII ("Système" → "Systeme"), for when Chrome
// refuses a name: it checks names through the system's locale, and on a
// machine whose locale is not UTF-8 any accent fails that check.
export function asciiPath(path) {
  return path
    .split('/')
    .map((part) => {
      const ascii = part
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/[^\x20-\x7e]/g, '_');
      return ascii.replace(/^[\s.]+/, '') || '_';
    })
    .join('/');
}

// Shortens by whole characters, never splitting one in two.
function cut(text, maxLength) {
  const chars = Array.from(text);
  return chars.length > maxLength ? chars.slice(0, maxLength).join('').trim() : text;
}

function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}
