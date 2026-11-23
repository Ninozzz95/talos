/*
 * 0.6.15 (owner 26/10/2026, «pacchetto npm a parte»): scripts/stage-remote-component.mjs makes the npm package of the iroh
 * binding only from the attested run pinned in IROH_COMPONENT_SOURCE. The `gh` arguments are the desktop's three checks
 * (that run, the attestation with signer + ref + commit and no self-hosted runners), the package says win32-x64 and the
 * license of iroh-ffi, and a binding whose hash is not the pinned one is never packed.
 */
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {IROH_COMPONENT,IROH_COMPONENT_SOURCE} from '../../src/remote/iroh-component.ts';
import {componentPackageJson,componentReadme,ghCommands,stageRemoteComponent} from '../../scripts/stage-remote-component.mjs';

test('gh downloads THAT run and verifies the attestation with signer, ref, commit and no self-hosted runners',()=>{
  const c=ghCommands(IROH_COMPONENT_SOURCE,IROH_COMPONENT.file,'D');
  assert.deepEqual(c.download,['run','download','39686248443','-R','Ninozzz95/talos','-n','iroh-win32-x64-msvc','-D','D']);
  assert.deepEqual(c.attestation,['attestation','verify',join('D',IROH_COMPONENT.file),'-R','Ninozzz95/talos','--signer-workflow','Ninozzz95/talos/.github/workflows/iroh-binding.yml','--source-ref','refs/heads/main','--source-digest','2ea6f9fecbb061210a953d3909095af85668411d','--deny-self-hosted-runners']);
});

test('the package: the pinned name and version, win32-x64 only, iroh-ffi\'s license, the provenance written down',()=>{
  const p=componentPackageJson();
  assert.equal(p.name,IROH_COMPONENT.package);
  assert.equal(p.version,IROH_COMPONENT.version);
  assert.deepEqual([p.os,p.cpu],[['win32'],['x64']]);
  assert.equal(p.license,'MIT OR Apache-2.0');
  assert.deepEqual(p.files,[IROH_COMPONENT.file,'README.md','LICENSE-MIT','LICENSE-APACHE']);
  assert.equal(p.talos.sha256,IROH_COMPONENT.sha256);
  const readme=componentReadme();
  for(const fact of [IROH_COMPONENT.sha256,String(IROH_COMPONENT_SOURCE.runId),IROH_COMPONENT_SOURCE.sourceCommit,IROH_COMPONENT_SOURCE.irohFfi.commit,'rustls 0.23.46'])assert.ok(readme.includes(fact),fact);
});

test('a run whose binding is not the pinned one is never packed',t=>{
  const out=mkdtempSync(join(tmpdir(),'talos-stage-remote-'));t.after(()=>rmSync(out,{recursive:true,force:true}));
  let packed=false;
  const gh=(args:string[])=>{if(args[0]==='run'){const dir=args[args.indexOf('-D')+1];writeFileSync(join(dir,IROH_COMPONENT.file),'not the binding');}return '';};
  assert.throws(()=>stageRemoteComponent(out,{gh,npm:()=>{packed=true;return 'x.tgz';}}),/SHA-256 .* the CLI pins/u);
  assert.equal(packed,false);
  assert.equal(existsSync(join(out,IROH_COMPONENT.package,IROH_COMPONENT.file)),false,'the wrong binding is not left in the package folder');
});

test('a failed attestation stops before anything is copied',t=>{
  const out=mkdtempSync(join(tmpdir(),'talos-stage-remote-'));t.after(()=>rmSync(out,{recursive:true,force:true}));
  const gh=(args:string[])=>{if(args[0]==='attestation')throw new Error('gh attestation verify failed (1): no matching attestation');if(args[0]==='run'){const dir=args[args.indexOf('-D')+1];writeFileSync(join(dir,IROH_COMPONENT.file),'x');}return '';};
  assert.throws(()=>stageRemoteComponent(out,{gh,npm:()=>'x.tgz'}),/attestation/u);
  assert.equal(existsSync(join(out,IROH_COMPONENT.package,IROH_COMPONENT.file)),false);
});
