// Renders a source's document tree, as NotebookLM sends it, into Markdown.
//
// The tree is a list of structural elements:
//   element   = [start, end, paragraph, _, table, image, codeBlock, ...,
//                horizontalRule (11)]
//   paragraph = [runs, [_, namedStyle], _, bulletInfo]
//   run       = [start, end, [text, [bold, italic, underline, url]]]
//   table     = [rowCount, columnCount, [[start, end, [[start, end, elements]]]]]
//   codeBlock = [content, languageHint]
// bulletInfo holds the nesting level at [2]; the list type (1 bullets,
// 2 numbers) and the item's number come either at positions 101 and 102 or
// in a trailing object keyed "102" and "103".

const PARAGRAPH = 2;
const TABLE = 4;
const CODE_BLOCK = 6;
const HORIZONTAL_RULE = 11;

// namedStyle → heading level: title, subtitle, then headings 1 to 6.
const HEADING_LEVEL = { 2: 1, 3: 2, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5, 9: 6 };

const ORDERED = 2;
const MAX_DEPTH = 20; // tables hold elements, which can hold tables

// headingOffset pushes every heading down, so a source's own headings sit
// below the title the file gives it.
export function renderBody(elements, { headingOffset = 0 } = {}) {
  return renderElements(elements, headingOffset, 0);
}

function renderElements(elements, headingOffset, depth) {
  if (!Array.isArray(elements) || depth > MAX_DEPTH) return '';
  let out = '';
  let previousWasItem = false;
  for (const element of elements) {
    if (!Array.isArray(element)) continue;
    const block = renderElement(element, headingOffset, depth);
    if (!block) continue;
    // List items sit on consecutive lines; everything else is a paragraph.
    if (out) out += block.item && previousWasItem ? '\n' : '\n\n';
    out += block.text;
    previousWasItem = block.item;
  }
  return out;
}

function renderElement(element, headingOffset, depth) {
  if (Array.isArray(element[PARAGRAPH])) return renderParagraph(element[PARAGRAPH], headingOffset);
  if (Array.isArray(element[TABLE])) {
    const text = renderTable(element[TABLE], depth);
    return text && { text, item: false };
  }
  if (Array.isArray(element[CODE_BLOCK])) {
    const text = renderCode(element[CODE_BLOCK]);
    return text && { text, item: false };
  }
  if (element[HORIZONTAL_RULE] != null) return { text: '---', item: false };
  return null; // images and the app's own internal blocks carry no text
}

function renderParagraph(paragraph, headingOffset) {
  const style = Array.isArray(paragraph[1]) ? paragraph[1][1] : null;
  const level = HEADING_LEVEL[style];
  const bullet = Array.isArray(paragraph[3]) ? paragraph[3] : null;

  if (level && !bullet) {
    const text = oneLine(renderRuns(paragraph[0], { plain: true }));
    if (!text) return null;
    return { text: `${'#'.repeat(Math.min(6, level + headingOffset))} ${text}`, item: false };
  }

  if (bullet) {
    const text = oneLine(renderRuns(paragraph[0], { plain: false }));
    if (!text) return null;
    const nesting = Number.isInteger(bullet[2]) && bullet[2] > 0 ? bullet[2] : 0;
    const { type, number } = listFields(bullet);
    const marker = type === ORDERED ? `${Number.isInteger(number) && number > 0 ? number : 1}.` : '-';
    return { text: `${'    '.repeat(nesting)}${marker} ${text}`, item: true };
  }

  // Web pages leave a stray space or two at the start of a paragraph; four or
  // more is indentation (code, say) and stays.
  const text = renderRuns(paragraph[0], { plain: false })
    .replace(/[ \t]+$/gm, '')
    .replace(/^\n+|\n+$/g, '')
    .replace(/^ {1,3}(?! )/, '');
  if (!text.trim()) return null;
  return { text, item: false };
}

function listFields(bullet) {
  const keyed = bullet.findLast((value) => value && typeof value === 'object' && !Array.isArray(value));
  if (keyed) return { type: keyed['102'], number: keyed['103'] };
  return { type: bullet[101], number: bullet[102] };
}

// Joins a paragraph's runs, merging neighbours styled alike so a phrase split
// into several runs is not wrapped in several pairs of markers.
function renderRuns(runs, { plain }) {
  if (!Array.isArray(runs)) return '';
  const merged = [];
  for (const element of runs) {
    const run = Array.isArray(element) ? element[2] : null;
    if (!Array.isArray(run) || typeof run[0] !== 'string') continue;
    const style = Array.isArray(run[1]) ? run[1] : [];
    const piece = {
      // Google Docs marks a line break inside a paragraph with a vertical tab.
      text: run[0].replace(/\v/g, '\n'),
      bold: !plain && style[0] === true,
      italic: !plain && style[1] === true,
      url: linkTarget(style[3]),
    };
    const last = merged.at(-1);
    if (last && last.bold === piece.bold && last.italic === piece.italic && last.url === piece.url) {
      last.text += piece.text;
    } else {
      merged.push(piece);
    }
  }
  return merged.map(formatRun).join('');
}

function formatRun({ text, bold, italic, url }) {
  if (!text.trim()) return text;
  // Markers must touch the words they wrap, so whitespace moves outside them.
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  let core = text.slice(lead.length, text.length - trail.length);
  if (bold && italic) core = `***${core}***`;
  else if (bold) core = `**${core}**`;
  else if (italic) core = `*${core}*`;
  if (url) core = `[${core.replace(/([[\]])/g, '\\$1')}](${url})`;
  return lead + core + trail;
}

function linkTarget(url) {
  if (typeof url !== 'string' || !/^(https?|mailto):/i.test(url)) return null;
  return url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function renderTable(table, depth) {
  const rows = Array.isArray(table[2]) ? table[2] : [];
  const grid = [];
  for (const row of rows) {
    const cells = Array.isArray(row) && Array.isArray(row[2]) ? row[2] : [];
    const texts = cells.map((cell) => cellText(Array.isArray(cell) ? cell[2] : null, depth));
    if (texts.some(Boolean)) grid.push(texts);
  }
  if (grid.length === 0) return '';

  const width = Math.max(...grid.map((row) => row.length));
  const line = (row) => `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`;
  const [header, ...body] = grid;
  return [line(header), line(Array(width).fill('---')), ...body.map(line)].join('\n');
}

// A cell can hold several paragraphs, even a list; Markdown cells are one line.
function cellText(elements, depth) {
  return renderElements(elements, 0, depth + 1)
    .trim()
    .replace(/\n+/g, '<br>')
    .replace(/\|/g, '\\|');
}

function renderCode(code) {
  const content = typeof code[0] === 'string' ? code[0].replace(/\n+$/, '') : '';
  if (!content.trim()) return '';
  const language = typeof code[1] === 'string' ? code[1].trim().split(/\s/)[0] : '';
  // The fence must be longer than any run of backticks in the code.
  const longest = Math.max(2, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${language}\n${content}\n${fence}`;
}

function oneLine(text) {
  return text.replace(/\s*\n\s*/g, ' ').trim();
}
