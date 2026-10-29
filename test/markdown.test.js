import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderBody } from '../extension/lib/markdown.js';
import {
  bold,
  codeBlock,
  horizontalRule,
  image,
  italic,
  keyedBullet,
  link,
  para,
  positionalBullet,
  run,
  table,
} from './helpers.js';

test('paragraphs are separated by a blank line', () => {
  assert.equal(renderBody([para([run('One.')]), para([run('Two.')])]), 'One.\n\nTwo.');
});

test('runs of a paragraph join without separators, as the source has them', () => {
  // The recorded Markdown source splits a sentence over three runs.
  assert.equal(renderBody([para([run('light energy into'), run(' '), run('chemical energy.')])]), 'light energy into chemical energy.');
});

test('headings take their level from the named style, pushed down by the offset', () => {
  const elements = [para([run('Title')], 2), para([run('H1')], 4), para([run('H2')], 5), para([run('H3')], 6)];
  assert.equal(renderBody(elements), '# Title\n\n# H1\n\n## H2\n\n### H3');
  assert.equal(renderBody(elements, { headingOffset: 1 }), '## Title\n\n## H1\n\n### H2\n\n#### H3');
});

test('a heading never goes below level 6', () => {
  assert.equal(renderBody([para([run('Deep')], 9)], { headingOffset: 2 }), '###### Deep');
});

test('a heading is one line and carries no emphasis markers', () => {
  assert.equal(renderBody([para([bold('Big'), run('\nnews')], 4)]), '# Big news');
});

test('bullets as the GitHub recording sends them (positional)', () => {
  const elements = [
    para([run('Intro')]),
    para([run('First')], 1, positionalBullet({ number: 1 })),
    para([run('Second')], 1, positionalBullet({ number: 2 })),
    para([run('Nested')], 1, positionalBullet({ nesting: 1, number: 1 })),
    para([run('After')]),
  ];
  assert.equal(renderBody(elements), 'Intro\n\n- First\n- Second\n    - Nested\n\nAfter');
});

test('numbered items as the Markdown recording sends them (keyed)', () => {
  const elements = [
    para([run('Light intensity')], 1, keyedBullet({ type: 2, number: 1, glyph: '1.' })),
    para([run('Carbon dioxide')], 1, keyedBullet({ type: 2, number: 2, glyph: '2.' })),
    para([run('Water is split')], 1, keyedBullet({ type: 1, number: 1 })),
  ];
  assert.equal(renderBody(elements), '1. Light intensity\n2. Carbon dioxide\n- Water is split');
});

test('bold, italic and links, with spaces kept outside the markers', () => {
  const elements = [para([run('See '), bold('this '), italic('now'), run(' or '), link('the docs', 'https://example.com/a b')])];
  assert.equal(renderBody(elements), 'See **this** *now* or [the docs](https://example.com/a%20b)');
});

test('neighbouring runs styled alike merge into one marked phrase', () => {
  assert.equal(renderBody([para([bold('two '), bold('runs')])]), '**two runs**');
  assert.equal(renderBody([para([link('Sign', 'https://x.test'), link(' in', 'https://x.test')])]), '[Sign in](https://x.test)');
});

test('an empty link target is plain text, and only web and mail links are kept', () => {
  assert.equal(renderBody([para([link('Skip to content', ''), link('script', 'javascript:alert(1)')])]), 'Skip to contentscript');
});

test('brackets in link text are escaped', () => {
  assert.equal(renderBody([para([link('[1]', 'https://x.test')])]), '[\\[1\\]](https://x.test)');
});

test('a vertical tab inside a paragraph is a line break', () => {
  assert.equal(renderBody([para([run('line one\vline two')])]), 'line one\nline two');
});

test('a stray leading space goes, indentation of four or more stays', () => {
  assert.equal(renderBody([para([run(' Sign in')])]), 'Sign in');
  assert.equal(renderBody([para([run('    indented()')])]), '    indented()');
});

test('empty paragraphs are skipped', () => {
  assert.equal(renderBody([para([run('  ')]), para([]), para([run('Text')])]), 'Text');
});

test('a table becomes a Markdown table, header first', () => {
  const elements = [table([['Name', 'Value'], ['a|b', '1'], ['c']])];
  assert.equal(renderBody(elements), '| Name | Value |\n| --- | --- |\n| a\\|b | 1 |\n| c |  |');
});

test('a code block is fenced, with a fence longer than any backticks inside', () => {
  assert.equal(renderBody([codeBlock('print(1)\n', 'python')]), '```python\nprint(1)\n```');
  assert.equal(renderBody([codeBlock('a ``` b')]), '````\na ``` b\n````');
});

test('a horizontal rule is kept and an image, which has no text, is skipped', () => {
  assert.equal(renderBody([para([run('Above')]), image(), horizontalRule(), para([run('Below')])]), 'Above\n\n---\n\nBelow');
});

test('junk elements do not break the rendering', () => {
  assert.equal(renderBody([null, 'x', [], [0, 1, null], para([run('Still here')])]), 'Still here');
  assert.equal(renderBody(null), '');
});
