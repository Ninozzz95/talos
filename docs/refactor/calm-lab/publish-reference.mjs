/** One-shot verified transport. Removed with its write-capable workflow after publication. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat,rm,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {brotliDecompressSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
const home='docs/refactor/calm-lab/reference-transfer';
const proto='harness-ui/frontend/prototypes/calm-lab';
const sha256=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update('blob '+Buffer.byteLength(b)+'\0').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(process.env.GITHUB_REPOSITORY,'Ninozzz95/talos');
assert.equal(process.env.GITHUB_REF,'refs/heads/refactor/desktop-ledger-2026-09-17');
assert.equal(git('rev-parse','HEAD'),process.env.GITHUB_SHA);
const packed=Buffer.from((await Promise.all(Array.from({length:8},(_,i)=>readFile(home+'/part-'+(i+1)+'.b64','utf8')))).join(''),'base64');
assert.equal(sha256(packed),'bd06877a6a755883b16057079da006922a3a183c2ca82fbfa5faf791ea54c452');
const json=brotliDecompressSync(packed,{maxOutputLength:1000000});
assert.equal(sha256(json),'040e13abc96203073a4efb45a356aa7cc2128129e2145ea43634513e1b03d182');
const packet=JSON.parse(json);assert.equal(packet.version,1);assert.equal(Object.keys(packet.files).length,27);
for(const [path,content] of Object.entries(packet.files)){
 assert.match(path,/^(?:(?:src|tests)\/[a-zA-Z0-9.-]+|README.md|NOTICE.md|package.json|build.mjs|make-contract.mjs)$/);
 assert.ok(!path.includes('..') && typeof content==='string' && content.length<200000);
}
await assert.rejects(lstat(proto),{code:'ENOENT'});
const cssPath='harness-ui/frontend/src/styles/main.css';let css=await readFile(cssPath,'utf8');
assert.equal(blob(css),'0d49b8aac76abc97484141bd0be5f6cc87b95894');
css=css.replace('le ANIMAZIONI del mockup approvato','le ANIMAZIONI del mockup interattivo');
assert.equal(blob(css),'0b30b5dda6e3eddc4ff797c9d3368ed29cd196fc');
const qa='harness-ui/frontend/tests/qualification/';
const changes=[];
for(const [name,hash] of [['settings-models-real.mjs','4522c0c7f5d0c6a2b72ab5c2d87db676f32a5d03'],['workspace-real.mjs','dc1d1030474e6cac726bf3aefd077200fd0cbd99']]){
 const original=await readFile(qa+name,'utf8');assert.equal(blob(original),hash);
 let next=original.replace(/(page\.locator\('[^']*'\)|select|control)\.selectOption\(([^)]*)\)/g,'selectValue($1,$2)');
 next=next.replace(/(page\.locator\('[^']*'\))\.uncheck\(\)/g,'checkValue($1,false)').replace(/(page\.locator\('[^']*'\))\.check\(\)/g,'checkValue($1,true)');
 if(name==='settings-models-real.mjs') next=next.replace(/await select\.isVisible\(\)/g,'await pickerVisible(select)').replace("page.locator('#motionEasingSelect').evaluate(el=>el===document.activeElement)","page.locator('#motionEasingSelect--calm').evaluate(el=>el===document.activeElement)").replace("page.locator('#td-studio-motionQualitySelect').waitFor({state:'visible'})","page.locator('#td-studio-motionQualitySelect--calm').waitFor({state:'visible'})");
 assert.notEqual(next,original);changes.push([qa+name,"import {selectValue,checkValue,pickerVisible} from './custom-control-driver.mjs';\n"+next]);
}
// All existing-path preimages verified before any writes.
for(const [path,content] of Object.entries(packet.files)){const full=resolve(proto,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,content,{flag:'wx'});}
await writeFile(cssPath,css);for(const [path,content] of changes) await writeFile(path,content);
// Visual review: Studio already owns its output including the unit.
await writeFile('harness-ui/frontend/src/design-system/calm-controls.css','\n/* Avoid a second raw number beside the Studio-owned value and unit. */\n.td-slider > .calm-control--range .calm-range__value { display:none; }\n',{flag:'a'});
execFileSync(process.execPath,[proto+'/make-contract.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,[proto+'/build.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['--test',...Object.keys(packet.files).filter(p=>p.startsWith('tests/')&&p.endsWith('.test.mjs')).map(p=>proto+'/'+p)],{stdio:'inherit'});
await copyFile('LICENSE',proto+'/LICENSE');
await mkdir(proto+'/evidence',{recursive:true});
await writeFile('docs/refactor/calm-lab/CP15-pubblicazione.md','# CP15 — riferimento approvato e regressioni\n\nIl prototipo v03 approvato, esteso a 40 impostazioni, 14 temi e componenti custom, è ora sorgente ordinario sotto `harness-ui/frontend/prototypes/calm-lab`. Non è importato dal prodotto. Generatore e build ricostruiscono il singolo HTML usando contratti e token canonici del checkout. I dati del catalogo restano dimostrativi.\n\nLa review visiva del prodotto ha rilevato il numero duplicato negli slider dello Studio: il renderer non mostra il proprio valore se lo Studio possiede già output/unità. I driver delle suite precedenti ora usano i controlli visibili: conservati scenari e assert, nessun `force` su elementi nascosti.\n\nLa CI precedente 35271853056 sul commit 750dcb4 ha 45 verifiche backend/browser superate, 1173 test frontend superati e uno skip, zero errori/avvisi browser. La consegna sorgenti 35271852768 ha invece fallito due interazioni native nei driver: questo esito negativo è conservato e non viene coperto dal primo successo. Il nuovo candidato richiede una nuova esecuzione.\n\nIl trasporto compresso è verificato con SHA-256 del pacchetto e JSON, conteggio/percorso/dimensioni, assenza dei destinatari e preimage dei file modificati; il workflow con diritto di scrittura e il payload vengono rimossi nello stesso commit. Nessun trasporto storico è rieseguito. Nessun merge, tag, release o modifica al profilo abituale.\n');
await rm(home,{recursive:true});await rm('docs/refactor/calm-lab/publish-reference.mjs');await rm('.github/workflows/desktop-calm-reference-transfer.yml');
console.log('Verified reference materialized as ordinary sources; review gates still required.');
