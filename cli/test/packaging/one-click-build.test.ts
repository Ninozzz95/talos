import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildOneClickDirectory} from '../../scripts/build-one-click.mjs';

test('one-click builder emits launcher app payload and docs without node_modules',async()=>{
 const root=await mkdtemp(join(tmpdir(),'talos-oneclick-src-'));const out=await mkdtemp(join(tmpdir(),'talos-oneclick-out-'));
 await mkdir(join(root,'cli','dist'),{recursive:true});await writeFile(join(root,'cli','dist','main.js'),'ok');
 await mkdir(join(root,'cli','packaging','one-click'),{recursive:true});await writeFile(join(root,'cli','packaging','one-click','START-TALOS-CLI.cmd'),'cmd');await writeFile(join(root,'cli','packaging','one-click','talos.cmd'),'talos');await writeFile(join(root,'cli','packaging','one-click','bootstrap.ps1'),'ps');await writeFile(join(root,'cli','packaging','one-click','README-START-HERE.txt'),'readme');
 await mkdir(join(root,'docs','review'),{recursive:true});await writeFile(join(root,'docs','review','TALOS-CLI-ENGINEERING-REVIEW.md'),'review');
 await buildOneClickDirectory({repoRoot:root,outDir:out});
 assert.equal(await readFile(join(out,'START-TALOS-CLI.cmd'),'utf8'),'cmd');
 assert.equal(await readFile(join(out,'talos.cmd'),'utf8'),'talos');
 assert.equal(await readFile(join(out,'app','dist','main.js'),'utf8'),'ok');
 const pkg=JSON.parse(await readFile(join(out,'app','package.json'),'utf8'));assert.deepEqual(pkg.dependencies,{ink:'7.1.1',react:'19.3.0'});assert.equal(pkg.devDependencies,undefined);
 assert.match(await readFile(join(out,'docs','TALOS-CLI-ENGINEERING-REVIEW.md'),'utf8'),/review/u);
});
