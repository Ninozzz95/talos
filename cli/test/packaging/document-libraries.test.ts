/*
 * Installation, documents (owner 02/10, «Piattaforma + documenti»): the document libraries the kernel imports on demand
 * (pdfmake with pdfkit and fontkit, pdf-lib, docx, xlsx, pptxgenjs, jszip) were ~60 MB and ~2,000 installed files. They are
 * built into one file each under vendor/node_modules/<name>/ (scripts/pack-documents.mjs), next to the kernel, where Node
 * finds them before the package's own node_modules; their data travels with them (pdfmake's Roboto fonts, pdfkit's font
 * metrics). The proof makes a real PDF, DOCX, XLSX and PPTX, reads a PDF back and unzips a file, from a folder OUTSIDE the
 * repository, so only the built libraries can answer.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {DOCUMENT_LIBRARIES,packDocumentLibraries} from '../../scripts/pack-documents.mjs';

const CLI=fileURLToPath(new URL('../../',import.meta.url));
let root:string|undefined;
test.after(()=>{if(root)rmSync(root,{recursive:true,force:true});});

test('each document library is one file with its license, and the data it reads from disk is beside it',async()=>{
  root=mkdtempSync(join(tmpdir(),'talos-documents-'));
  const out=join(root,'node_modules');
  await packDocumentLibraries({out});
  assert.deepEqual(readdirSync(out).sort(),[...DOCUMENT_LIBRARIES,'eld','pdfjs-dist'].sort());
  for(const name of DOCUMENT_LIBRARIES){
    const js=readdirSync(join(out,name)).filter(file=>/\.(c|m)?js$/u.test(file));
    assert.equal(js.length,1,`${name}: one file, found ${js.join(', ')}`);
    assert.ok(existsSync(join(out,name,'package.json')),`${name}: package.json`);
    assert.ok(readdirSync(join(out,name)).some(file=>/^licen[cs]e/iu.test(file)),`${name}: its license travels with it`);
  }
  assert.ok(existsSync(join(out,'pdfmake','build','fonts','Roboto','Roboto-Regular.ttf')),'the kernel resolves pdfmake/build/fonts/Roboto/…');
  assert.ok(existsSync(join(out,'pdfmake','data','Helvetica.afm')),'pdfkit reads its font metrics next to the file it runs from');
});

test('from outside the repository the built libraries make a real PDF, DOCX, XLSX and PPTX, read a PDF and unzip a file',()=>{
  assert.ok(root,'the libraries were built by the test above');
  const script=join(root,'make.mjs');
  writeFileSync(script,`import {createRequire} from 'node:module';import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);const out={};
const {default:pdfmake}=await import('pdfmake');
out.pdfmakeFrom=require.resolve('pdfmake');
const roboto=dirname(require.resolve('pdfmake/build/fonts/Roboto/Roboto-Regular.ttf'));
pdfmake.setUrlAccessPolicy(()=>false);pdfmake.setLocalAccessPolicy(p=>p.startsWith(roboto));
pdfmake.setFonts({Roboto:{normal:join(roboto,'Roboto-Regular.ttf'),bold:join(roboto,'Roboto-Medium.ttf'),italics:join(roboto,'Roboto-Italic.ttf'),bolditalics:join(roboto,'Roboto-Medium.ttf')}});
const pdf=Buffer.from(await pdfmake.createPdf({content:['TALOS caffè 中文',{text:'bold',bold:true}]}).getBuffer());out.pdf=pdf.subarray(0,5).toString();
const {PDFDocument}=await import('pdf-lib');out.pages=(await PDFDocument.load(pdf)).getPageCount();
const {Document,Packer,Paragraph,TextRun}=await import('docx');
const docx=Buffer.from(await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[new TextRun('TALOS')]})]}]})));out.docx=docx.subarray(0,2).toString();
const xlsx=await import('xlsx');const book=xlsx.utils.book_new();xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([['a',1]]),'Sheet1');
const sheet=Buffer.from(xlsx.write(book,{type:'array',bookType:'xlsx'}));out.xlsx=sheet.subarray(0,2).toString();
const {default:PptxGenJS}=await import('pptxgenjs');const deck=new PptxGenJS();deck.addSlide().addText('TALOS',{x:1,y:1});
const pptx=Buffer.from(await deck.write({outputType:'arraybuffer'}));out.pptx=pptx.subarray(0,2).toString();
const {default:JSZip}=await import('jszip');out.zipEntries=Object.keys((await JSZip.loadAsync(docx)).files).includes('word/document.xml');
console.log(JSON.stringify(out));`);
  const run=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:120_000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const out=JSON.parse(run.stdout.trim().split('\n').at(-1)!);
  assert.ok(String(out.pdfmakeFrom).startsWith(root!),`pdfmake came from the built copy, not from elsewhere: ${out.pdfmakeFrom}`);
  assert.deepEqual({pdf:out.pdf,pages:out.pages,docx:out.docx,xlsx:out.xlsx,pptx:out.pptx,zip:out.zipEntries},{pdf:'%PDF-',pages:1,docx:'PK',xlsx:'PK',pptx:'PK',zip:true});
});

/*
 * Desktop F-001 d25d0d0ae (merged 02/10, registro 12): the kernel's `leggi` extracts the text of DOCX, XLSX, PPTX and PDF
 * (`harness-ui/src/kernel/estrai-documento.mjs`). It takes jszip and xlsx with `require` (createRequire), and pdf.js from
 * `require.resolve('pdfjs-dist/package.json')`, then `legacy/build/pdf.min.mjs`, which imports `./pdf.worker.mjs` beside
 * it, and `cmaps/` and `standard_fonts/`. In Node 24 `require` of an ES module gives its namespace, not the library, unless
 * the module exports `'module.exports'` (Node docs, «Loading ECMAScript modules using require()»). pdf.js travels as its
 * files, never installed: as a dependency it would bring the optional native @napi-rs/canvas (37 MB) everywhere.
 */
/* r4 block 14 and the notifications: `import('eld')` for the language of a message, `import('markdown-it')` for the text of a notification */
test('from outside the repository the built eld names a language and the built markdown-it reads Markdown, as the kernel takes them',()=>{
  assert.ok(root,'the libraries were built by the test above');
  const script=join(root,'language.mjs');
  writeFileSync(script,`import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const out={};
out.markdownFrom=require.resolve('markdown-it');
const modulo=await import('markdown-it');const MarkdownIt=modulo?.default??modulo;
out.html=new MarkdownIt({html:true,linkify:false}).renderInline('**TALOS**');
const {eld}=await import('eld');const detector=eld.newInstance();await detector.load('extrasmall');
out.language=detector.detect('Questa frase è scritta in italiano e parla della conversazione di oggi con molte parole normali').language;
console.log(JSON.stringify(out));`);
  const run=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:60_000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const out=JSON.parse(run.stdout.trim().split('\n').at(-1)!);
  assert.ok(String(out.markdownFrom).startsWith(root!),`markdown-it came from the built copy: ${out.markdownFrom}`);
  assert.equal(out.html,'<strong>TALOS</strong>');
  assert.equal(out.language,'it');
});

test('eld travels with the one database the kernel loads, not the four of the package',()=>{
  assert.ok(root,'the libraries were built by the test above');
  assert.deepEqual(readdirSync(join(root,'node_modules','eld','src','ngrams')),['extrasmall.js']);
  assert.ok(readdirSync(join(root,'node_modules','eld')).some(file=>/^licen[cs]e/iu.test(file)),'its license travels with it');
});

test('pdf.js travels as the files the kernel loads, with its license and none of its native extras',()=>{
  assert.ok(root,'the libraries were built by the first test');
  const pdfjs=join(root!,'node_modules','pdfjs-dist');
  for(const file of ['package.json','LICENSE',join('legacy','build','pdf.min.mjs'),join('legacy','build','pdf.worker.mjs'),join('cmaps','UniGB-UCS2-H.bcmap'),join('standard_fonts','FoxitFixed.pfb')])
    assert.ok(existsSync(join(pdfjs,file)),`pdfjs-dist/${file}`);
  assert.equal(existsSync(join(pdfjs,'build')),false,'only the legacy build Node needs');
  assert.equal(existsSync(join(pdfjs,'node_modules')),false,'no native extras');
  assert.deepEqual(readdirSync(join(pdfjs,'legacy','build')).sort(),['pdf.min.mjs','pdf.worker.mjs']);
});

test('the kernel\'s require of jszip and xlsx gets the library itself from the built copy',()=>{
  assert.ok(root,'the libraries were built by the first test');
  const script=join(root!,'require.cjs');
  writeFileSync(script,`const JSZip=require('jszip');const XLSX=require('xlsx');
console.log(JSON.stringify({jszip:typeof JSZip,loadAsync:typeof JSZip.loadAsync,instance:typeof new JSZip().file,xlsx:typeof XLSX.utils?.sheet_to_json,read:typeof XLSX.read,from:require.resolve('jszip')}));`);
  const run=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:60_000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const out=JSON.parse(run.stdout.trim().split('\n').at(-1)!);
  assert.ok(String(out.from).startsWith(root!),`jszip from the built copy: ${out.from}`);
  assert.deepEqual({jszip:out.jszip,loadAsync:out.loadAsync,instance:out.instance,xlsx:out.xlsx,read:out.read},{jszip:'function',loadAsync:'function',instance:'function',xlsx:'function',read:'function'});
});

test('the kernel\'s own extractor, beside the built copy, reads the text of a real DOCX, XLSX and PDF',()=>{
  assert.ok(root,'the libraries were built by the first test');
  const kernel=join(root!,'kernel');
  writeFileSync(join(root!,'extract.mjs'),`import {copyFileSync,mkdirSync} from 'node:fs';import {createRequire} from 'node:module';import {dirname,join} from 'node:path';import {pathToFileURL} from 'node:url';
const here=${JSON.stringify(root)};const require=createRequire(join(here,'x.js'));
mkdirSync(${JSON.stringify(kernel)},{recursive:true});
copyFileSync(${JSON.stringify(join(CLI,'..','harness-ui','src','kernel','estrai-documento.mjs'))},join(${JSON.stringify(kernel)},'estrai-documento.mjs'));
const {estraiTestoDocumento}=await import(pathToFileURL(join(${JSON.stringify(kernel)},'estrai-documento.mjs')).href);
const {Document,Packer,Paragraph,TextRun}=await import('docx');
const docx=Buffer.from(await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[new TextRun('TALOS docx caffè')]})]}]})));
const xlsx=await import('xlsx');const book=xlsx.utils.book_new();xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([['TALOS sheet',42]]),'Data');
const sheet=Buffer.from(xlsx.write(book,{type:'array',bookType:'xlsx'}));
const {default:pdfmake}=await import('pdfmake');const roboto=dirname(require.resolve('pdfmake/build/fonts/Roboto/Roboto-Regular.ttf'));
pdfmake.setUrlAccessPolicy(()=>false);pdfmake.setLocalAccessPolicy(p=>p.startsWith(roboto));
pdfmake.setFonts({Roboto:{normal:join(roboto,'Roboto-Regular.ttf'),bold:join(roboto,'Roboto-Medium.ttf'),italics:join(roboto,'Roboto-Italic.ttf'),bolditalics:join(roboto,'Roboto-Medium.ttf')}});
const pdf=Buffer.from(await pdfmake.createPdf({content:['TALOS pdf text']}).getBuffer());
const out={};for(const [format,data] of [['docx',docx],['xlsx',sheet],['pdf',pdf]]){const r=await estraiTestoDocumento(data,format);out[format]=r.testo??r;}
out.pdfjsFrom=require.resolve('pdfjs-dist/package.json');
console.log(JSON.stringify(out));`);
  const run=spawnSync(process.execPath,[join(root!,'extract.mjs')],{cwd:root,encoding:'utf8',timeout:120_000});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const out=JSON.parse(run.stdout.trim().split('\n').at(-1)!);
  assert.ok(String(out.pdfjsFrom).startsWith(root!),`pdf.js from the built copy: ${out.pdfjsFrom}`);
  assert.match(String(out.docx),/TALOS docx caffè/u);assert.match(String(out.xlsx),/TALOS sheet\t42/u);assert.match(String(out.pdf),/TALOS pdf text/u);
});
