# NotebookLM Source Extractor

A Chrome extension that saves every source of a [NotebookLM](https://notebooklm.google.com) notebook as Markdown:

- **One file per source**: a folder named after the notebook, with one `.md` file per source.
- **All sources in one file**: a single `.md` file with every source, one after another.

It reads the full text NotebookLM holds for each source (PDFs, web pages, Google Docs, YouTube transcripts, pasted text…),
keeps its headings, lists, tables, links, bold and italics, and saves it to your Downloads folder.

## Install

1. Download **[NotebookLM-Source-Extractor.zip](https://github.com/LorenzoCirac/NotebookLM-Source-Extractor/raw/main/release/NotebookLM-Source-Extractor.zip)**
   (it lives in the [`release/`](release/) folder) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped folder (the one with `manifest.json` in it).
4. Optional: pin the extension from the puzzle-piece menu, so its button is always in the toolbar.

Needs Chrome 116 or later. Other Chromium browsers that support extension side panels should work too.

## Use

1. Open a notebook in NotebookLM.
2. Click the extension's button. A side panel opens with the notebook's name and how many sources it has.
3. Choose **One file per source** or **All sources in one file**.

The side panel stays open while you keep working in NotebookLM, and shows the progress. When it is done, **Show in
folder** opens the result. Sources NotebookLM cannot provide are listed with the reason: one still being processed,
one that failed to import, or one with no text (an image, for example).

Every source in the notebook is saved, including those inside collapsed groups, whether or not it is ticked in
NotebookLM.

### What the files look like

One file per source (`Downloads/<notebook>/<source>.md`):

```markdown
# Installation guide.pdf

Source: PDF

## Prerequisites

- Windows Server 2019
- SQL Server 2017 or later
```

All in one file (`Downloads/<notebook>.md`): the notebook's title, a numbered list of its sources, then each source
under its own `##` heading, separated by `---`.

File names follow the source titles, with characters that file systems refuse removed, and the original extension
replaced: `Report.pdf` is saved as `Report.md`. A source added by its web address is named after the page. Saving the
same notebook again never overwrites: Chrome adds `(1)`, `(2)`… to the new files.

## Privacy

The extension only talks to NotebookLM, from inside your open NotebookLM tab and with the sign-in you already have,
the same way NotebookLM's own page does. Nothing is sent anywhere else, and nothing is collected. It only reads; it
never changes your notebooks.

Permissions it asks for:

| Permission | Why |
| --- | --- |
| Read and change your data on `notebooklm.google.com`, `notebook.google.com` | To ask NotebookLM for your sources from the open tab |
| `scripting` | To make that request inside the NotebookLM tab |
| `downloads` | To save the Markdown files |
| `sidePanel` | To show its panel next to the page |

## Good to know

- NotebookLM has no public API. The extension uses the same internal requests as NotebookLM's own page, so a change
  on Google's side can break it. If the panel says NotebookLM's reply could not be read, that is the likely cause.
- If Chrome is set to **Ask where to save each file**, it will ask once per file in "One file per source" mode. Turn
  that setting off in `chrome://settings/downloads` for a big notebook, or use "All sources in one file".
- Images inside sources are not saved; the text around them is.

## Development

No dependencies, no build step: the `extension/` folder is the extension.

```bash
npm test
```

```bash
npm run pack
```

`npm test` runs the tests (Node 20 or later). `npm run pack` runs them, then rebuilds
`release/NotebookLM-Source-Extractor.zip` from `extension/`. Bump `version` in both `extension/manifest.json` and
`package.json` for a new release (a test checks they match).

```
extension/
  manifest.json      the extension
  background.js      opens the side panel from the toolbar button
  panel.html/.css/.js  the side panel
  lib/
    page.js          the one function that runs inside the NotebookLM tab: sends a request with the page's session
    wire.js          NotebookLM's request format and reply format ("batchexecute")
    notebook.js      reads the notebook (title, sources) and a source (title, text) out of the replies
    markdown.js      turns a source's document tree into Markdown
    gather.js        reads every source, three at a time, and notes what was skipped and why
    files.js         file names and the layout of both kinds of file
    client.js        runs a request in the tab, retries hiccups, turns failures into plain words
test/                one test file per module; helpers.js builds replies laid out as NotebookLM sends them
scripts/pack.mjs     builds the zip in release/
release/             the packed extension, ready to download
```
