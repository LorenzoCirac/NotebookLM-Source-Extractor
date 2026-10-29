import assert from 'node:assert/strict';
import { test } from 'node:test';

import { asciiPath, fileNames, folderName, notebookDocument, safeName, sourceDocument } from '../extension/lib/files.js';
import { para, run } from './helpers.js';

const body = (...headingAndText) => [para([run(headingAndText[0])], 4), para([run(headingAndText[1])])];

test('a source file: title, where it came from, then the text a level down', () => {
  const markdown = sourceDocument({ title: 'A page', kind: 'Web page', url: 'https://example.com', body: body('Intro', 'Hello.') });
  assert.equal(markdown, '# A page\n\nSource: Web page · https://example.com\n\n## Intro\n\nHello.\n');
});

test('a source with nothing to say about where it came from has no source line', () => {
  assert.equal(sourceDocument({ title: 'Notes', kind: null, url: null, body: body('H', 'T') }), '# Notes\n\n## H\n\nT\n');
});

test('the one-file document lists its sources, then each under its own heading', () => {
  const sources = [
    { title: 'First', kind: 'PDF', url: null, body: body('Part', 'One.') },
    { title: 'Second', kind: null, url: 'https://example.com', body: body('Part', 'Two.') },
  ];
  assert.equal(
    notebookDocument({ title: 'My notebook' }, sources, '2026-10-29'),
    [
      '# My notebook',
      '',
      '2 sources from NotebookLM, saved 2026-10-29.',
      '',
      '1. First',
      '2. Second',
      '',
      '---',
      '',
      '## First',
      '',
      'Source: PDF',
      '',
      '### Part',
      '',
      'One.',
      '',
      '---',
      '',
      '## Second',
      '',
      'Source: https://example.com',
      '',
      '### Part',
      '',
      'Two.',
      '',
    ].join('\n'),
  );
});

test('file names drop the original extension and end in .md', () => {
  assert.deepEqual(fileNames(['Report.pdf', 'Guide (FR).docx.pdf', 'notes.txt', 'script.py']), [
    'Report.md',
    'Guide (FR).docx.md',
    'notes.md',
    'script.py.md',
  ]);
});

test('a source titled with its address is named after the page', () => {
  assert.deepEqual(
    fileNames([
      'https://raw.githubusercontent.com/org/repo/main/docs/v3-subagent-mechanism.md',
      'https://example.com/',
      'https://example.com/a%20page',
    ]),
    ['v3-subagent-mechanism.md', 'example.com.md', 'a page.md'],
  );
});

test('file names are unique, ignoring case', () => {
  assert.deepEqual(fileNames(['Notes', 'notes', 'NOTES.pdf', 'Other']), ['Notes.md', 'notes (2).md', 'NOTES (3).md', 'Other.md']);
});

test('characters file systems or Chrome refuse are replaced', () => {
  assert.equal(safeName('GitHub - org/repo: How? <Really> "yes" a|b ~x*', 'x'), "GitHub - org-repo - How Really 'yes' a-b x");
  assert.equal(safeName('tab\there​zero-width', 'x'), 'tab here zero-width');
});

test('leading and trailing dots and spaces go; empty names fall back', () => {
  assert.equal(safeName(' ..hidden. ', 'x'), 'hidden');
  assert.equal(safeName('...', 'Untitled source'), 'Untitled source');
  assert.deepEqual(fileNames(['', null]), ['Untitled source.md', 'Untitled source (2).md']);
});

test('Windows device names are not used as file names', () => {
  assert.equal(safeName('CON', 'x'), '_CON');
  assert.equal(safeName('com1', 'x'), '_com1');
  assert.equal(safeName('Console', 'x'), 'Console');
});

test('long names are cut by whole characters', () => {
  const name = safeName('é'.repeat(99) + '😀😀', 'x');
  assert.equal(Array.from(name).length, 100);
  assert.ok(name.endsWith('😀'));
  assert.ok(name.isWellFormed());
});

test('the ASCII fallback keeps the name readable and the folder in place', () => {
  assert.equal(asciiPath('Administration et Système/Préférences – l’été.md'), "Administration et Systeme/Preferences - l'ete.md");
  assert.equal(asciiPath('日本/ﬁle ½.md'), '__/file 1_2.md');
  assert.equal(asciiPath('Ελλάδα.md'), '______.md');
});

test('the folder is named after the notebook', () => {
  assert.equal(folderName('TEEXMA: admin & system'), 'TEEXMA - admin & system');
  assert.equal(folderName(''), 'NotebookLM notebook');
  assert.equal(Array.from(folderName('x'.repeat(200))).length, 60);
});
