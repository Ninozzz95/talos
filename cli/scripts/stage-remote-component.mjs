#!/usr/bin/env node
/*
 * 0.6.15 (owner 26/10/2026, «pacchetto npm a parte»): makes the npm package `talos-code-remote-win32-x64` the CLI downloads on
 * the first `talos remote` (src/remote/iroh-component.ts). It is published like the CLI's own packages, with the owner's
 * approval, and only from the attested run pinned in IROH_COMPONENT_SOURCE — the same three checks the desktop's
 * harness-ui/scripts/scarica-binding-iroh.mjs makes before a release:
 *   1. `gh run download` from THAT run (not «the latest»);
 *   2. `gh attestation verify` with the signer workflow, the source ref AND the source commit, no self-hosted runners;
 *   3. the file's SHA-256 is the one pinned in the CLI (the CLI refuses any other at download and at every load).
 * Then: package.json (os/cpu win32-x64, license MIT OR Apache-2.0 like iroh-ffi), README with the provenance, iroh-ffi's two
 * license texts at the pinned commit, and `npm pack`.
 *
 *   node scripts/stage-remote-component.mjs <out-dir>
 *
 * `gh` reads its own login. Nothing is published here: publishing is a separate step with the owner's approval.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IROH_COMPONENT,IROH_COMPONENT_SOURCE} from '../src/remote/iroh-component.ts';

/** The exact `gh` arguments, exported for the tests. */
export function ghCommands(source,file,destination){
  return {
    download:['run','download',String(source.runId),'-R',source.repository,'-n',source.artifact,'-D',destination],
    attestation:['attestation','verify',join(destination,file),'-R',source.repository,
      '--signer-workflow',`${source.repository}/${source.workflow}`,
      '--source-ref',source.sourceRef,'--source-digest',source.sourceCommit,'--deny-self-hosted-runners'],
  };
}

export function componentPackageJson(component=IROH_COMPONENT,source=IROH_COMPONENT_SOURCE){
  return {
    name:component.package,
    version:component.version,
    description:'The iroh network binding TALOS CLI uses for remote control (Windows x64). Downloaded and checked by TALOS itself; not meant to be installed directly.',
    license:'MIT OR Apache-2.0',
    os:['win32'],
    cpu:['x64'],
    files:[component.file,'README.md','LICENSE-MIT','LICENSE-APACHE'],
    repository:{type:'git',url:`git+https://github.com/${source.irohFfi.repository}.git`},
    talos:{sha256:component.sha256,run:`https://github.com/${source.repository}/actions/runs/${source.runId}`,sourceCommit:source.sourceCommit,irohFfi:`${source.irohFfi.tag} (${source.irohFfi.commit})`},
  };
}

export function componentReadme(component=IROH_COMPONENT,source=IROH_COMPONENT_SOURCE){
  return [
    `# ${component.package}`,
    '',
    'The native [iroh](https://github.com/n0-computer/iroh-ffi) binding that TALOS CLI loads for remote control on Windows x64.',
    'TALOS downloads this package by itself the first time you run `talos remote`, and loads the file only when its SHA-256 is',
    'the one written in its own code. Installing this package directly does nothing.',
    '',
    '## Provenance',
    '',
    `- File: \`${component.file}\`, SHA-256 \`${component.sha256}\``,
    `- Built by \`${source.workflow}\` in ${source.repository}, run ${source.runId}, from commit \`${source.sourceCommit}\` (${source.sourceRef}), with a GitHub build attestation`,
    `- Source: ${source.irohFfi.repository} ${source.irohFfi.tag} (\`${source.irohFfi.commit}\`), compiled with an updated Cargo.lock (rustls 0.23.46, RUSTSEC-2026-0285)`,
    '',
    '## License',
    '',
    'MIT OR Apache-2.0, like iroh-ffi. Both texts are in this package.',
    '',
  ].join('\n');
}

function run(command,args,options={}){
  const r=spawnSync(command,args,{encoding:'utf8',windowsHide:true,...options});
  if(r.error||r.status!==0){
    const detail=(r.stderr||r.stdout||r.error?.message||'').trim().split('\n').slice(-3).join(' | ');
    throw new Error(`${command} ${args.slice(0,2).join(' ')} failed (${r.error?.code??r.status}): ${detail}`);
  }
  return r.stdout;
}
const sha256=file=>createHash('sha256').update(readFileSync(file)).digest('hex');

export function stageRemoteComponent(outDir,{gh=(args)=>run('gh',args,{maxBuffer:64*1024*1024}),npm=(args,cwd)=>run(process.platform==='win32'?'npm.cmd':'npm',args,{cwd,shell:process.platform==='win32'})}={}){
  const out=resolve(outDir);
  const pkgDir=join(out,IROH_COMPONENT.package);
  rmSync(pkgDir,{recursive:true,force:true});
  mkdirSync(pkgDir,{recursive:true});
  const temporary=mkdtempSync(join(tmpdir(),'talos-remote-component-'));
  try{
    const commands=ghCommands(IROH_COMPONENT_SOURCE,IROH_COMPONENT.file,temporary);
    gh(commands.download);
    gh(commands.attestation);
    const found=sha256(join(temporary,IROH_COMPONENT.file));
    if(found!==IROH_COMPONENT.sha256)throw new Error(`The run's binding has SHA-256 ${found}, the CLI pins ${IROH_COMPONENT.sha256}.`);
    copyFileSync(join(temporary,IROH_COMPONENT.file),join(pkgDir,IROH_COMPONENT.file));
    const {repository,commit}=IROH_COMPONENT_SOURCE.irohFfi;
    for(const name of ['LICENSE-MIT','LICENSE-APACHE']){
      const text=gh(['api',`repos/${repository}/contents/${name}?ref=${commit}`,'-H','Accept: application/vnd.github.raw']);
      if(!text.trim())throw new Error(`${name} of ${repository}@${commit} is empty.`);
      writeFileSync(join(pkgDir,name),text);
    }
  }finally{rmSync(temporary,{recursive:true,force:true});}
  writeFileSync(join(pkgDir,'package.json'),JSON.stringify(componentPackageJson(),null,2)+'\n');
  writeFileSync(join(pkgDir,'README.md'),componentReadme());
  if(sha256(join(pkgDir,IROH_COMPONENT.file))!==IROH_COMPONENT.sha256)throw new Error('The staged binding changed after the check.');
  const packed=npm(['pack','--pack-destination',out],pkgDir).trim().split('\n').at(-1);
  const tarball=join(out,packed);
  return {pkgDir,tarball,tarballSha256:sha256(tarball),bindingSha256:IROH_COMPONENT.sha256};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const outDir=process.argv[2];
  if(!outDir){console.error('Usage: node scripts/stage-remote-component.mjs <out-dir>');process.exitCode=2;}
  else try{
    const r=stageRemoteComponent(outDir);
    console.log(JSON.stringify(r,null,2));
  }catch(e){console.error(`Remote component not staged: ${e.message}`);process.exitCode=1;}
}
