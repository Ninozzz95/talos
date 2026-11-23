/*
 * Installation, documents (owner 02/10, «Piattaforma + documenti»; registro 12). The document libraries the kernel imports on
 * demand — `import('pdfmake')`, `import('pdf-lib')`, `import('docx')`, `import('xlsx')`, `import('pptxgenjs')`,
 * `import('jszip')` (harness-ui/src/document-generator.mjs) — were ~60 MB and ~2,000 files of the installed package. Each
 * is built here into ONE file under vendor/node_modules/<name>/, with a package.json and its license: the kernel lives in
 * vendor/harness-ui/src, so Node's lookup meets vendor/node_modules before the package's own node_modules, and the kernel
 * code stays exactly as the desktop wrote it. They work offline, as before.
 * The data they read from disk travels with them: pdfmake's Roboto fonts (the kernel resolves
 * `pdfmake/build/fonts/Roboto/Roboto-Regular.ttf`) and pdfkit's font metrics (read from `__dirname + '/data/…'`, and
 * `__dirname` is now the folder of pdfmake's one file).
 * Same tool as the CLI bundle (esbuild, scripts/bundle.mjs): platform node, CommonJS, which esbuild annotates so Node sees
 * the named exports (`const {Document,Packer} = await import('docx')`).
 */
import {copyFile,cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';

const here=dirname(fileURLToPath(import.meta.url));
export const CLI_ROOT=resolve(here,'..');
const IDENTIFIER=/^[A-Za-z_$][\w$]*$/u;
const RESERVED=new Set(['default','break','case','catch','class','const','continue','debugger','delete','do','else','enum','export','extends','false','finally','for','function','if','import','in','instanceof','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','let','static','implements','interface','package','private','protected','public','await']);
/* markdown-it is no document library, but it arrives the same way: the kernel's `import('markdown-it')`, on the first notification with Markdown */
export const DOCUMENT_LIBRARIES=Object.freeze(['docx','jszip','markdown-it','pdf-lib','pdfmake','pptxgenjs','xlsx']);
/* eld's databases: the kernel loads only this one (lingua-del-testo.mjs), the package's four are 8.8 MB */
const ELD_DATABASE='extrasmall';

async function licenseOf(packageDir){return(await readdir(packageDir)).find(file=>/^licen[cs]e/iu.test(file))??null;}
/* the package folder from its entry, walking up to its own package.json (docx's exports do not expose ./package.json) */
async function packageDirOf(entry,name){
  for(let dir=dirname(entry);;){
    try{if(JSON.parse(await readFile(join(dir,'package.json'),'utf8')).name===name)return dir;}catch{/* none here */}
    const parent=dirname(dir);if(parent===dir)throw Object.assign(new Error(`DOCUMENT_LIBRARY_NOT_FOUND:${name}`),{code:'DOCUMENT_LIBRARY_NOT_FOUND'});dir=parent;
  }
}

export async function packDocumentLibraries({cliRoot=CLI_ROOT,out=join(cliRoot,'vendor','node_modules')}={}){
  const require=createRequire(join(cliRoot,'package.json'));
  const built=[];
  for(const name of DOCUMENT_LIBRARIES){
    const entry=require.resolve(name);
    const packageDir=await packageDirOf(entry,name);
    const meta=JSON.parse(await readFile(join(packageDir,'package.json'),'utf8'));
    const target=join(out,name);await mkdir(target,{recursive:true});
    /* The libraries are CommonJS whose named exports Node finds by reading their source (`exports.X =`, tslib's `__exportStar`);
       one built file hides them (`await import('pdf-lib')` gave no PDFDocument). So the file is an ES module that names
       them: the library's own export names, read here, and `default` = the whole library, as Node gives it today. */
    const names=Object.keys(require(name)).filter(key=>IDENTIFIER.test(key)&&!RESERVED.has(key));
    await esbuild.build({
      /* `'module.exports'` (desktop F-001, 02/10): the kernel's text extractor takes jszip and xlsx with `require`, and Node 24
         gives `require` of an ES module its namespace unless the module names what `require` returns (Node docs, «Loading
         ECMAScript modules using require()»). Through a local constant: re-exporting the CommonJS import binding directly,
         esbuild 0.28.2 printed `module.exports as"module.exports"`, which is not valid JavaScript (measured 02/10). */
      stdin:{contents:`import library from ${JSON.stringify(entry)};\nexport default library;\nconst forRequire=library;\nexport {forRequire as 'module.exports'};\n${names.length?`export const {${names.join(',')}}=library;\n`:''}`,resolveDir:cliRoot,sourcefile:`${name}-entry.mjs`,loader:'js'},
      outfile:join(target,'index.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',minify:true,legalComments:'eof',logLevel:'warning',
      /* CommonJS inside an ES module: `require` for Node's own modules, `__dirname` for pdfkit's `__dirname + '/data/…'` */
      banner:{js:"import{createRequire as __talosCreateRequire}from'node:module';import{dirname as __talosDirname}from'node:path';import{fileURLToPath as __talosFileURLToPath}from'node:url';const require=__talosCreateRequire(import.meta.url);const __filename=__talosFileURLToPath(import.meta.url);const __dirname=__talosDirname(__filename);"},
    });
    const license=await licenseOf(packageDir);
    if(!license)throw Object.assign(new Error(`DOCUMENT_LIBRARY_LICENSE_MISSING:${name}`),{code:'DOCUMENT_LIBRARY_LICENSE_MISSING'});
    await copyFile(join(packageDir,license),join(target,license));
    await writeFile(join(target,'package.json'),`${JSON.stringify({name,version:meta.version,license:meta.license,type:'module',main:'index.mjs',description:`${name} ${meta.version}, built into one file for TALOS (scripts/pack-documents.mjs)`},null,2)}\n`);
    built.push({name,version:meta.version});
  }
  /* the data pdfmake (and pdfkit inside it) read from disk */
  const pdfmakeDir=await packageDirOf(require.resolve('pdfmake'),'pdfmake');
  await cp(join(pdfmakeDir,'build','fonts','Roboto'),join(out,'pdfmake','build','fonts','Roboto'),{recursive:true});
  const pdfkitDir=await packageDirOf(createRequire(join(pdfmakeDir,'package.json')).resolve('pdfkit'),'pdfkit');
  await cp(join(pdfkitDir,'js','data'),join(out,'pdfmake','data'),{recursive:true});
  /* pdf.js (desktop F-001, 02/10): the kernel resolves `pdfjs-dist/package.json` and loads `legacy/build/pdf.min.mjs`, which
     imports `./pdf.worker.mjs` beside it, plus `cmaps/` and `standard_fonts/` by path. Copied as those files, like the desktop
     package (`sfoltisciPdfjs`), never installed: as a dependency it would bring the native @napi-rs/canvas (37 MB). */
  const pdfjsDir=await packageDirOf(require.resolve('pdfjs-dist/package.json'),'pdfjs-dist');
  const pdfjsOut=join(out,'pdfjs-dist');
  await mkdir(join(pdfjsOut,'legacy','build'),{recursive:true});
  for(const file of ['package.json','LICENSE',join('legacy','build','pdf.min.mjs'),join('legacy','build','pdf.worker.mjs')])await copyFile(join(pdfjsDir,file),join(pdfjsOut,file));
  for(const folder of ['cmaps','standard_fonts'])await cp(join(pdfjsDir,folder),join(pdfjsOut,folder),{recursive:true});
  built.push({name:'pdfjs-dist',version:JSON.parse(await readFile(join(pdfjsDir,'package.json'),'utf8')).version});
  /* eld (r4 block 14, the language of a message): `load()` imports its database by a built name, which one file could not follow,
     and its exports have no `require` condition, so the folder is found by path. Copied as files, like pdf.js, without the other
     databases and the static entries that import them. */
  const eldDir=join(cliRoot,'node_modules','eld');
  const eldOut=join(out,'eld');
  await mkdir(eldOut,{recursive:true});
  for(const file of ['package.json','LICENSE'])await copyFile(join(eldDir,file),join(eldOut,file));
  await cp(join(eldDir,'src'),join(eldOut,'src'),{recursive:true,filter:file=>{
    const name=basename(file);
    if(basename(dirname(file))==='ngrams')return name===`${ELD_DATABASE}.js`;
    return !name.startsWith('static.')||name===`static.${ELD_DATABASE}.js`;
  }});
  built.push({name:'eld',version:JSON.parse(await readFile(join(eldDir,'package.json'),'utf8')).version});
  return built;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const built=await packDocumentLibraries();
  process.stdout.write(`documents: ${built.map(row=>`${row.name} ${row.version}`).join(', ')} built into vendor/node_modules\n`);
}
