/*
 * P18 phase 3 (owner 2026-09-26: "TALOS più veloce di tutti"; ripgrep inside the npm package, matches with their lines,
 * capped). On the hermetic bench, four `cerca` over 6,000 files took 9.3 s and stopped at 5,000 reads (incomplete). The
 * kernel's `cerca` now runs ripgrep when TALOS_RG_PATH names one (the CLI sets it from `@vscode/ripgrep`), with the same
 * meaning as the JS walk (substring, any case, .gitignore, .git and node_modules out), and each match as path:line:text.
 * Without a ripgrep it keeps the JS walk.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {provideBundledRipgrep} from '../../src/runtime/repo.ts';

const kernel:any=await import(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url).href);

function tree(){
  const root=mkdtempSync(join(tmpdir(),'p18-cerca-'));
  const put=(rel:string,text:string)=>{const p=join(root,...rel.split('/'));mkdirSync(join(p,'..'),{recursive:true});writeFileSync(p,text);};
  put('.gitignore','ignored/\n');
  put('src/a.ts','const x=1;\n// the Needle is here\nconst y=2;\n');
  put('src/deep/b/c.ts','export const needle=true;\n');
  put('.config/hidden.txt','needle in a hidden file\n');
  put('ignored/skip.ts','needle but ignored\n');
  put('node_modules/pkg/index.js','needle in a dependency\n');
  put('src/none.ts','nothing to see\n');
  return root;
}
async function withRg<T>(rgPath:string|undefined,fn:()=>Promise<T>):Promise<T>{
  const before=process.env.TALOS_RG_PATH;
  if(rgPath===undefined)delete process.env.TALOS_RG_PATH;else process.env.TALOS_RG_PATH=rgPath;
  try{return await fn();}finally{if(before===undefined)delete process.env.TALOS_RG_PATH;else process.env.TALOS_RG_PATH=before;}
}
const env:NodeJS.ProcessEnv={};await provideBundledRipgrep(env);const RG=env.TALOS_RG_PATH;

test('P18: the CLI finds the bundled ripgrep of this platform',()=>{
  assert.ok(RG&&/rg(\.exe)?$/u.test(RG),`@vscode/ripgrep gives a binary (${RG})`);
});

test('P18: with ripgrep, cerca gives path:line:text, any case, respecting .gitignore, .git and node_modules',async()=>{
  const root=tree();
  try{
    const out:string=await withRg(RG,()=>kernel.cercaNelProgetto(kernel.discoNode({radice:root}),{testo:'NEEDLE'},{radice:root}));
    assert.deepEqual(out.split('\n'),['.config/hidden.txt:1:needle in a hidden file','src/a.ts:2:// the Needle is here','src/deep/b/c.ts:1:export const needle=true;']);
    /* the same files the JS walk finds (the old contract), only with their lines */
    const js:string=await withRg(join(root,'no-such-rg.exe'),()=>kernel.cercaNelProgetto(kernel.discoNode({radice:root}),{testo:'NEEDLE'},{radice:root}));
    assert.deepEqual(js.split('\n').sort(),['.config/hidden.txt','src/a.ts','src/deep/b/c.ts'],'without a ripgrep, the JS walk as before');
    const none:string=await withRg(RG,()=>kernel.cercaNelProgetto(kernel.discoNode({radice:root}),{testo:'absent-word-3f9a'},{radice:root}));
    assert.match(none,/^no file matches "absent-word-3f9a"/u);
    const both:string=await withRg(RG,()=>kernel.cercaNelProgetto(kernel.discoNode({radice:root}),{testo:'needle',nome:'deep'},{radice:root}));
    /* G02: the unified kernel's T-13 (desktop, owner D6, 28/09): `nome` with `testo` is a FILTER (AND), no longer a second
       list of path matches (cercaConRipgrep: «`nome` con `testo` è un FILTRO, non un secondo elenco — l'AND vero»). */
    assert.deepEqual(both.split('\n'),['src/deep/b/c.ts:1:export const needle=true;'],'only the lines of files whose path contains nome');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('P18: the cut is declared, per file and in files',async()=>{
  const root=mkdtempSync(join(tmpdir(),'p18-cerca-cap-'));
  try{
    for(let i=0;i<50;i++)writeFileSync(join(root,`f${String(i).padStart(2,'0')}.txt`),'hit\n'.repeat(8));
    const out:string=await withRg(RG,()=>kernel.cercaNelProgetto(kernel.discoNode({radice:root}),{testo:'hit'},{radice:root}));
    const lines=out.split('\n');
    assert.equal(lines.filter(l=>/^f\d\d\.txt:\d+:hit$/u.test(l)).length,100,'at most 100 matching lines');
    assert.equal(lines.filter(l=>l.startsWith('f00.txt:')).length,5,'at most 5 lines per file');
    assert.ok(lines.includes('… and 30 more files with matches not shown — narrow the search.'),out.slice(-300));
    assert.ok(lines.includes('(at most 5 matching lines per file are shown)'));
  }finally{rmSync(root,{recursive:true,force:true});}
});
