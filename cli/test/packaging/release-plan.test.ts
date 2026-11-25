/*
 * The release pipeline's decisions (owner 09/10/2026 «Pipeline sul tag, come Codex», «Dal pubblico, col bollino»):
 * the GitHub release says the version's CHANGELOG section, and npm gets the platform packages first under their own
 * tags, the main package last, a rerun skips what is already there, and nothing goes out without provenance.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {isAbsolute,join,resolve} from 'node:path';
import test from 'node:test';
import {publishAll,publishPlan,releaseNotes} from '../../scripts/release-plan.mjs';

const CHANGELOG=['# TALOS CLI','','## Unreleased','- next thing','','## talos-cli-v0.5.1 — 2026-10-09','','### Fixed','- one fix','','## talos-cli-v0.5.0 — 2026-10-08','- older'].join('\n');

test('release notes: the version\'s own CHANGELOG section, without its heading and without the next one',()=>{
  assert.equal(releaseNotes(CHANGELOG,'0.5.1'),'### Fixed\n- one fix\n');
  assert.equal(releaseNotes(CHANGELOG,'0.5.0'),'- older\n','the last section runs to the end of the file');
  assert.throws(()=>releaseNotes(CHANGELOG,'0.5.2'),/no section "## talos-cli-v0\.5\.2"/u,'a tag with no notes stops the release');
  assert.throws(()=>releaseNotes(CHANGELOG,'0.5'),/invalid CLI version/u);
  assert.throws(()=>releaseNotes('## talos-cli-v0.6.0\n\n## talos-cli-v0.5.1\n- x','0.6.0'),/is empty/u);
  assert.throws(()=>releaseNotes(CHANGELOG.replace('v0.5.1 —','v0.5.10 —'),'0.5.1'),/no section/u,'0.5.10 is not 0.5.1');
});

test('the real CHANGELOG has notes for the version in package.json, or the tag would stop the release',()=>{
  const version=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version as string;
  const changelog=readFileSync(new URL('../../CHANGELOG.md',import.meta.url),'utf8');
  assert.ok(releaseNotes(changelog,version).length>40,version);
});

test('npm plan: platforms first under their own tags, the main package last; a prerelease never touches latest',()=>{
  assert.deepEqual(publishPlan('0.5.1'),[
    {file:'talos-code-0.5.1-win32-arm64.tgz',tag:'win32-arm64'},
    {file:'talos-code-0.5.1-win32-x64.tgz',tag:'win32-x64'},
    {file:'talos-code-0.5.1.tgz',tag:'latest'},
  ]);
  assert.deepEqual(publishPlan('0.5.2-beta.1').map(step=>step.tag),['next-win32-arm64','next-win32-x64','next']);
});

function folderWith(version:string){
  const dir=mkdtempSync(join(tmpdir(),'talos-release-plan-'));
  for(const step of publishPlan(version))writeFileSync(join(dir,step.file),'x');
  return dir;
}

test('npm publish: in order, with provenance; a version already there is skipped; any other failure stops',()=>{
  const dir=folderWith('0.5.1');
  try{
    const calls:string[][]=[];
    const done=publishAll({version:'0.5.1',folder:dir,npm:(args:string[])=>{calls.push(args);
      if(args[0]==='--version')return{status:0,output:'11.6.2\n'};
      if(args[1]!.endsWith('win32-arm64.tgz'))return{status:1,output:'npm error 403 You cannot publish over the previously published versions: 0.5.1-win32-arm64.'};
      return{status:0,output:'+ talos-code'};}});
    assert.deepEqual(done.map(step=>step.outcome),['already-published','published','published']);
    assert.deepEqual(calls.slice(1).map(args=>[args[0],args[1]!.slice(dir.length+1),...args.slice(2)]),[
      ['publish','talos-code-0.5.1-win32-arm64.tgz','--tag','win32-arm64','--provenance'],
      ['publish','talos-code-0.5.1-win32-x64.tgz','--tag','win32-x64','--provenance'],
      ['publish','talos-code-0.5.1.tgz','--tag','latest','--provenance'],
    ]);

    const stopped:string[]=[];
    assert.throws(()=>publishAll({version:'0.5.1',folder:dir,npm:(args:string[])=>{stopped.push(args[1]??'');
      if(args[0]==='--version')return{status:0,output:'11.5.1'};
      return args[1]!.endsWith('win32-x64.tgz')?{status:1,output:'npm error 404 trusted publisher not configured'}:{status:0,output:''};}}),/win32-x64\.tgz --tag win32-x64 failed[\s\S]*trusted publisher/u);
    assert.ok(!stopped.some(file=>file.endsWith('talos-code-0.5.1.tgz')),'the main package is never published after a platform failed');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('npm publish: an npm older than trusted publishing, or a missing tarball, stops before anything is published',()=>{
  const dir=folderWith('0.5.1');
  try{
    let published=0;
    const npm=(version:string)=>(args:string[])=>{if(args[0]==='--version')return{status:0,output:version};published+=1;return{status:0,output:''};};
    assert.throws(()=>publishAll({version:'0.5.1',folder:dir,npm:npm('11.5.0')}),/npm 11\.5\.1 or newer/u);
    assert.throws(()=>publishAll({version:'0.5.1',folder:dir,npm:npm('10.9.9')}),/npm 11\.5\.1 or newer/u);
    rmSync(join(dir,'talos-code-0.5.1-win32-x64.tgz'));
    assert.throws(()=>publishAll({version:'0.5.1',folder:dir,npm:npm('12.0.0')}),/missing npm tarball: talos-code-0\.5\.1-win32-x64\.tgz/u);
    assert.equal(published,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('npm publish from a relative folder, as cli-release.yml passes release-files: npm gets absolute paths, never a GitHub shortcut',()=>{
  // npm takes «release-files/x.tgz» for the GitHub repository release-files/x.tgz (npm-package-arg isFileSpec wants «.», «~/», «/»
  // or a drive letter first): the first real publish stopped at `git ls-remote ssh://git@github.com/release-files/...`.
  const dir=mkdtempSync('talos-release-plan-rel-');
  try{
    assert.ok(!isAbsolute(dir),dir);
    for(const step of publishPlan('0.5.1'))writeFileSync(join(dir,step.file),'x');
    const calls:string[][]=[];
    publishAll({version:'0.5.1',folder:dir,npm:(args:string[])=>{calls.push(args);return args[0]==='--version'?{status:0,output:'11.6.2'}:{status:0,output:'+ talos-code'};}});
    const files=calls.slice(1).map(args=>args[1]!);
    assert.equal(files.length,3);
    for(const file of files)assert.ok(isAbsolute(file),`npm publish ${file}`);
    assert.deepEqual(files,publishPlan('0.5.1').map(step=>resolve(dir,step.file)));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('npm publish from a private repository: the same order without --provenance, which npm cannot make there',()=>{
  const dir=folderWith('0.5.1');
  try{
    const calls:string[][]=[];
    publishAll({version:'0.5.1',folder:dir,provenance:false,npm:(args:string[])=>{calls.push(args);return args[0]==='--version'?{status:0,output:'11.6.2'}:{status:0,output:'+ talos-code'};}});
    assert.deepEqual(calls.slice(1).map(args=>[args[0],args[1]!.slice(dir.length+1),...args.slice(2)]),[
      ['publish','talos-code-0.5.1-win32-arm64.tgz','--tag','win32-arm64'],
      ['publish','talos-code-0.5.1-win32-x64.tgz','--tag','win32-x64'],
      ['publish','talos-code-0.5.1.tgz','--tag','latest'],
    ]);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
