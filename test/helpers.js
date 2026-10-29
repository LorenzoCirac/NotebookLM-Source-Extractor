// Builders for NotebookLM replies, laid out exactly as recorded from the web
// app: an anti-XSSI line, then length/JSON line pairs, the answer frame first
// and the stream's bookkeeping frames after it. The content is made up.

export function replyOf(rpcId, payload, { extraFrames = [] } = {}) {
  const answer = ['wrb.fr', rpcId, payload == null ? null : JSON.stringify(payload), null, null, null, 'generic'];
  return stream([[answer, ...extraFrames, ['di', 147], ['af.httprm', 146, '4448936487322653086', 10]]]);
}

export function stream(chunks) {
  let text = ")]}'\n";
  for (const chunk of [...chunks, [['e', 4, null, null, 411]]]) {
    const json = JSON.stringify(chunk);
    text += `\n${json.length}\n${json}`;
  }
  return `${text}\n`;
}

// A source row as GET_NOTEBOOK lists it: [[id], title, metadata, [_, status]].
// metadata: [_, words, [created], [revision, [time]], kind, youtube, _, [url]]
export function sourceRow({ id, title, kind = 5, url = null, youtube = null, status = 2, envelope }) {
  const metadata = [null, 1105, [1768268904, 969842000], ['rev', [1768268904, 722716000]], kind, youtube ? [youtube] : null, 1];
  if (url) metadata.push([url]);
  return [envelope ?? [id], title, metadata, [null, status]];
}

// The GET_NOTEBOOK payload: [[title, sources, id, emoji, _, settings, ...]]
export function notebookPayload({ title, sources, id = 'nb-1' }) {
  return [[title, sources, id, '📘', null, [1, false, true, null, null, [1778873028, 229919000], 1, false]]];
}

// Document-tree builders, positions as in the recorded replies.
export const run = (text, style) => [0, text.length, style ? [text, style] : [text]];
export const bold = (text) => run(text, [true]);
export const italic = (text) => run(text, [null, true]);
export const link = (text, url) => run(text, [null, null, null, url]);

export function para(runs, style = 1, bullet = undefined) {
  const paragraph = [runs, [null, style]];
  if (bullet) paragraph.push(null, bullet);
  return [0, 1, paragraph];
}

// Bullet info as the GitHub recording carries it: positional, padded with
// nulls up to the glyph at 100, list type at 101 and number at 102.
export function positionalBullet({ nesting = null, type = 1, number = 1 }) {
  const info = [null, null, nesting];
  info[100] = String(number);
  info[101] = type;
  info[102] = number;
  info[103] = number;
  return Array.from(info, (value) => value ?? null);
}

// Bullet info as the Markdown-source recording carries it: a keyed object.
export function keyedBullet({ nesting = 0, type = 1, number = 1, glyph = '•' }) {
  return [null, null, nesting, { 101: glyph, 102: type, 103: number, 104: number - 1 }];
}

export function table(rows) {
  const tableRows = rows.map((cells) => [0, 1, cells.map((cell) => [0, 1, [para([run(cell)])]])]);
  return [0, 1, null, null, [rows.length, rows[0]?.length ?? 0, tableRows]];
}

export const codeBlock = (content, language) => [0, 1, null, null, null, null, [content, language]];

export const horizontalRule = () => [0, 1, null, null, null, null, null, null, null, null, null, []];
export const image = () => [0, 1, null, null, null, ['https://example.com/a.png', 'img-1']];

// The GET_SOURCE payload: [descriptor, _, _, [body]] with body = [elements]
export function sourcePayload({ id = 'src-1', title, kind = 5, url = null, elements }) {
  const descriptor = sourceRow({ id, title, kind, url });
  return [descriptor, null, null, elements === null ? null : [[elements]]];
}
