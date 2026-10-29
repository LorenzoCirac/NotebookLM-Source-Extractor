// The extension as Chrome loads it: the manifest, the files it names, and the
// page markup the panel script expects.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../extension/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the manifest and package.json carry the same version', () => {
  assert.equal(manifest.version, pkg.version);
});

test('every file the manifest names exists', () => {
  const named = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const path of named) assert.ok(existsSync(new URL(path, root)), `${path} is missing`);
});

test('the extension reaches only NotebookLM, on both its hosts', () => {
  assert.deepEqual(manifest.host_permissions, ['https://notebooklm.google.com/*', 'https://notebook.google.com/*']);
  assert.deepEqual(manifest.permissions.sort(), ['downloads', 'scripting', 'sidePanel']);
});

test('every element the panel script looks up is in the panel', () => {
  const html = read('panel.html');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const wanted = [...read('panel.js').matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(wanted.length > 0);
  for (const id of wanted) assert.ok(ids.has(id), `#${id} is missing from panel.html`);
});
