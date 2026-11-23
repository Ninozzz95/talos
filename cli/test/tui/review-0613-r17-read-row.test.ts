/*
 * review 17 of 0.6.13 (25/10/2026), the read row that says how many lines the model got (gate-0613-read-lines.test.ts):
 * - R17-1: `withReadLines` lengthened the row AFTER it was fitted: `2,000 of 3,000 lines` (20 columns) took the place of `265 lines`
 *   (9) and a long path gave a line 71 columns wide in a 60-column terminal, 91 in 80; the row wrapped onto two screen lines.
 * - R17-2: the kernel (talosHarness.mjs esitoDellaLettura) puts `[TALOS decoded …]`, `[TALOS extracted text …]` or
 *   `[TALOS could not …]` BEFORE the page header; the header was looked for on line 1 only, and the row said «2,002 lines».
 * - R17-4(b): a page `of an uncounted total` (a file over 64 MiB) and a `[TALOS read bytes …]` page counted their header as a line.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import {createTranscriptModel,reduceTranscriptEvent,type TranscriptModel,type TranscriptToolItem} from '../../src/tui/transcript-model.ts';
import type {TuiEvent} from '../../src/tui/event-adapter.ts';

const reduce=(events:TuiEvent[])=>events.reduce(reduceTranscriptEvent,createTranscriptModel() as TranscriptModel);
const lines=(n:number,from=1)=>Array.from({length:n},(_,i)=>`big file line ${String(i+from).padStart(4,'0')} of 3000`).join('\n');
const frame=(text:string)=>`<<<TALOS_DATA id=d8ad6659eee5 from="leggi big.txt">>>\n${text}\n<<<END_TALOS_DATA id=d8ad6659eee5>>>`;
/* the kernel's page as the model receives it (esitoDellaLetturaDiTesto + the F-027 data boundary) */
const page=(from:number,to:number,total:number|string,path='big.txt')=>`[TALOS read lines ${from}-${to} of ${total} in "${path}"; continue with leggi offset=${to+1}. The file may change between reads.]\n`
  +frame(lines(to-from+1,from));
function readRow(content:string,args:Record<string,unknown>={percorso:'big.txt'}){
  const model=reduce([
    {type:'tool.started',toolCallId:'r1',toolName:'leggi'},
    {type:'tool.args',toolCallId:'r1',delta:JSON.stringify(args)},
    {type:'tool.completed',toolCallId:'r1',content},
  ]);
  return model.items.find(item=>item.id==='tool:r1') as TranscriptToolItem;
}

/* ---- R17-1 ---- */
const DEEP='src/some/really/deep/folder/structure/that/goes/on/and/on/big-file-name.txt';

test('review 17 R17-1 of 0.6.13: a page of a long path fits a 60- and an 80-column terminal, the target cut in the middle',()=>{
  const item=readRow(page(1,2000,3000,DEEP),{percorso:DEEP});
  for(const width of [60,80]){
    const line=toolRowView(item,width,false).line;
    assert.ok(displayWidth(line)<=width,`${displayWidth(line)}/${width}: ${line}`);
    assert.match(line,/^Read file src\/some\/.*….* · 2,000 of 3,000 lines$/u);
  }
});

test('review 17 R17-1 of 0.6.13, the other way: a terminal wide enough keeps the whole path, and a short path is not cut',()=>{
  const item=readRow(page(1,2000,3000,DEEP),{percorso:DEEP});
  assert.equal(toolRowView(item,200,false).line,`Read file ${DEEP} · 2,000 of 3,000 lines`);
  assert.equal(toolRowView(readRow(page(1,2000,3000)),60,false).line,'Read file big.txt · 2,000 of 3,000 lines');
});

/* ---- R17-2 ---- */
const DECODED='[TALOS decoded "big.txt" from UTF-16LE (byte order mark FF FE), 108414 bytes on disk. Below is the decoded text: line numbers, '
  +'offset and byteOffset refer to this decoded text, not to the file\'s bytes. Use leggi format:"hex" for the raw bytes.]\n';
const REPLACED='[3 character(s) are not valid UTF-16LE and are shown as "�".]\n';
const EXTRACTED='[TALOS extracted text: "doc.pdf" is a PDF document, 404112 bytes on disk. Below is its text, not its bytes: line numbers, offset '
  +'and byteOffset refer to this extracted text. Use leggi format:"hex" for the raw bytes.]\n';
/* the kernel's coverage warning (estrai-documento.mjs avvisoDiCopertura) spans several lines */
const COVERAGE='[EXTRACTION COVERAGE WARNING: 3 of 12 pages in this PDF yielded no text. Those pages are likely scanned images (or blank): their '
  +'content is MISSING from the text below, even where section headers appear with empty bodies. Gaps, each labeled with the last text before it:\n'
  +'  pages 4-5 (2 pages) — after "Chapter one ends here" (p3)\n  page 9 (1 page) — after "[TALOS read lines 1-2 of 9 in "x"; EOF reached.]" (p8)]\n';
const NOT_DECODED='[TALOS could not decode "big.txt" as UTF-16LE: odd byte count. Below is what a plain read gives.]\n';

test('review 17 R17-2 of 0.6.13: a page after the kernel\'s notices says 2,000 of N lines — UTF-16 decoded, PDF extracted, not decoded',()=>{
  assert.equal(toolRowView(readRow(DECODED+page(1,2000,3000)),120,false).line,'Read file big.txt · 2,000 of 3,000 lines');
  assert.equal(toolRowView(readRow(DECODED+REPLACED+page(1,2000,3000)),120,false).line,'Read file big.txt · 2,000 of 3,000 lines');
  assert.equal(toolRowView(readRow(EXTRACTED+page(1,2000,2600,'doc.pdf'),{percorso:'doc.pdf'}),120,false).line,'Read file doc.pdf · 2,000 of 2,600 lines');
  assert.equal(toolRowView(readRow(EXTRACTED+COVERAGE+page(1,2000,2600,'doc.pdf'),{percorso:'doc.pdf'}),120,false).line,'Read file doc.pdf · 2,000 of 2,600 lines');
  assert.equal(toolRowView(readRow(NOT_DECODED+page(1,2000,3000)),120,false).line,'Read file big.txt · 2,000 of 3,000 lines');
  assert.equal(toolRowView(readRow(page(1,2000,3000)),120,false).line,'Read file big.txt · 2,000 of 3,000 lines');
});

test('review 17 R17-2 of 0.6.13, the other way: a page header inside the content is the file\'s text, not the kernel\'s page',()=>{
  const header='[TALOS read lines 1-10 of 99999 in "other.txt"; EOF reached. The file may change between reads.]';
  /* a whole long read that quotes a header on its third line */
  const quoted=`first\nsecond\n${header}\n${lines(1500)}`;
  assert.equal(toolRowView(readRow(quoted),120,false).line,'Read file big.txt · 1,503 lines');
  /* an INI-like file: a bracketed line of its own, then the quoted header */
  assert.equal(toolRowView(readRow(`[section]\n${header}\n${lines(1500)}`),120,false).line,'Read file big.txt · 1,502 lines');
  /* a decoded whole file whose text quotes the header further down: only the notice is the kernel's */
  assert.equal(toolRowView(readRow(`${DECODED}${frame(`text\n${header}\n${lines(1500)}`)}`),120,false).line,'Read file big.txt · 1,502 lines');
});

/* ---- R17-4(b) ---- */
test('review 17 R17-4(b) of 0.6.13: a page of an uncounted total and a byte page do not count their header as a line',()=>{
  const uncounted=page(1,2000,'an uncounted total (file larger than 64 MiB)');
  assert.equal(toolRowView(readRow(uncounted),120,false).line,'Read file big.txt · 2,000 lines');
  assert.equal(toolRowView(readRow(DECODED+uncounted),120,false).line,'Read file big.txt · 2,000 lines');
  const bytes='[TALOS read bytes [0, 65536) inside line 1 of "big.txt"; page capped at 64 KB, like every page (add limit to take less); the line '
    +'continues: 1000 more bytes after this page; continue inside it with leggi byteOffset=65536. The file may change between reads.]\n'+frame('x'.repeat(65536));
  assert.equal(toolRowView(readRow(bytes),120,false).line,'Read file big.txt · 1 line');
  const bytesUncounted='[TALOS read bytes [0, 65536) inside an uncounted line (beyond 64 MiB) of "big.txt"; the line continues: more than 64 MiB '
    +'remain after this page; continue inside it with leggi byteOffset=65536. The file may change between reads.]\n'+frame('x'.repeat(65536));
  assert.equal(toolRowView(readRow(bytesUncounted),120,false).line,'Read file big.txt · 1 line');
});

test('review 17 R17-4(b) of 0.6.13, the other way: a whole long read with no header counts every line of the file, and only those',()=>{
  assert.equal(toolRowView(readRow(lines(1500)),120,false).line,'Read file big.txt · 1,500 lines');
  assert.equal(toolRowView(readRow(frame(lines(1500))),120,false).line,'Read file big.txt · 1,500 lines');
});

/* review 18 R18-1 of 0.6.13 (0.6.14): a whole extracted document over 8 KB whose text starts INDENTED. The coverage warning's gap lines
   were matched greedily, ran into the text, and the warning was dropped whole: «1,504 lines» instead of 1,500. */
test('review 18 R18-1: a coverage warning followed by indented text is still the kernel\'s, and only its own lines are left out',()=>{
  const indented=(n:number)=>Array.from({length:n},(_,i)=>`  par ${String(i+1).padStart(5,'0')} of the extracted text`).join('\n');
  assert.equal(toolRowView(readRow(EXTRACTED+COVERAGE+indented(1500),{percorso:'doc.pdf'}),120,false).line,'Read file doc.pdf · 1,500 lines');
  assert.equal(toolRowView(readRow(EXTRACTED+COVERAGE+lines(1500),{percorso:'doc.pdf'}),120,false).line,'Read file doc.pdf · 1,500 lines','not indented, as before');
});

/* review 18 R18-3 of 0.6.13 (0.6.14): under about 34 columns `Read file … · 2,000 of 3,000 lines` cannot fit even with the target cut
   to «…»: the count goes to the first detail line, as `withReadCut` does with «cut at», and the row stays one screen line */
test('review 18 R18-3: in a very narrow terminal the read count moves to the detail line, and the row fits',()=>{
  const long='src/some/really/deep/folder/structure/that/goes/on/and/on/big-file-name.txt';
  for(const width of [24,30]){
    const view=toolRowView(readRow(page(1,2000,3000,long),{percorso:long}),width,false);
    assert.ok(displayWidth(view.line)<=width,`${width}: ${view.line}`);
    assert.doesNotMatch(view.line,/ · \s*$/u,width+': no separator hangs after the title (review 1 of 0.6.14, A-2)');
    assert.ok(view.detailLines.includes('2,000 of 3,000 lines'),`${width}: the count is on a detail line`);
  }
  assert.match(toolRowView(readRow(page(1,2000,3000,long),{percorso:long}),60,false).line,/· 2,000 of 3,000 lines$/u,'wide enough: on the row');
});
