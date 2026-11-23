/*
 * P-F (owner 08/10/2026): a package that is inlined into a bundle is no longer installed beside it, so its LICENSE file no longer travels with it, and most
 * permissive licences (MIT, BSD, ISC, Apache-2.0) ask for their notice to ship with copies. `legalComments` keeps only the comments a library marked as legal,
 * which many do not. Both bundles (the CLI's, scripts/bundle.mjs, and the kernel's, scripts/bundle-kernel.mjs) therefore write a THIRD_PARTY_LICENSES.txt next
 * to their output: every npm package esbuild inlined (read from the metafile), with its version, its declared licence and its licence text.
 * Before this the CLI bundle inlined Ink, React, jsdiff… with no notice at all (the package lock was the only inventory).
 */
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

/** The npm package an input of the metafile belongs to: `node_modules/<name>` (scoped or not), or null for the project's own files. */
export function packageOf(input){
  const at=input.lastIndexOf('node_modules/');if(at<0)return null;
  const rest=input.slice(at+'node_modules/'.length).split('/');
  const name=rest[0].startsWith('@')?`${rest[0]}/${rest[1]}`:rest[0];
  return{name,dir:input.slice(0,at+'node_modules/'.length)+name};
}

async function licenceText(packageDir){
  const file=(await readdir(packageDir)).find(f=>/^(?:licen[cs]e|copying)(?:\.(?:md|txt))?$/iu.test(f));
  return file?await readFile(join(packageDir,file),'utf8'):null;
}

/** One row per inlined package directory: name, version, declared licence, licence text (null when the package ships none). */
export async function inlinedPackageLicences({inputs,absWorkingDir}){
  const seen=new Map();
  for(const input of inputs){
    const pkg=packageOf(input);if(!pkg||seen.has(pkg.dir))continue;
    const dir=resolve(absWorkingDir,pkg.dir);
    let json;try{json=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));}catch{continue;}
    seen.set(pkg.dir,{name:json.name??pkg.name,version:json.version??'?',license:typeof json.license==='string'?json.license:JSON.stringify(json.license??'UNKNOWN'),text:await licenceText(dir)});
  }
  return[...seen.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
}

/** Writes `<outdir>/THIRD_PARTY_LICENSES.txt` and returns the rows as the manifests record them. */
export async function writeLicenceFile({title,rows,outdir}){
  const body=rows.map(row=>`${'='.repeat(78)}\n${row.name}@${row.version}  (${row.license})\n${'='.repeat(78)}\n${row.text??'(this package ships no licence file; its package.json declares the licence above)'}\n`).join('\n');
  await writeFile(join(outdir,'THIRD_PARTY_LICENSES.txt'),`${title} (${rows.length}).\n\n${body}`);
  return rows.map(row=>({name:row.name,version:row.version,license:row.license,hasText:row.text!==null}));
}
