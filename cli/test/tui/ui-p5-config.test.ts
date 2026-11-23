import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {projectId} from '../../src/paths.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {readConfigScope,writeConfigScope} from '../../src/config/load.ts';
import {createConfigPanelStore,loadConfigPanelValues} from '../../src/tui/config-panel.ts';
import {configPanelOverlay} from '../../src/tui/overlays/config-panel.ts';

/* stage 6c (owner 02/10) replaced REV-NATIVE-SELECTION: on by default, an explicit switch-off survives reload */
test('6c-CONFIG: the mouse is on by default and an explicit switch-off survives reload',async()=>{
  const env=hermeticProfile(),options={paths:env.paths,projectRoot:env.root};
  try{
    assert.equal((await loadConfigPanelValues(options)).mouse,true);
    await writeConfigScope({...options,scope:'project-user',patch:{ui:{mouse:false}}});
    assert.equal((await loadConfigPanelValues(options)).mouse,false);
  }finally{env.restore();}
});

test('P5-PERSIST one choice overrides the project privately and preserves unrelated fields',async()=>{
  const env=hermeticProfile(),options={paths:env.paths,projectRoot:env.root};
  try{
    await writeConfigScope({...options,scope:'project',patch:{ui:{maxProseWidth:100,mouse:false}}});
    await writeConfigScope({...options,scope:'project-user',patch:{ui:{theme:'noir'}}});
    const widths:Array<number|null>=[];const store=createConfigPanelStore({...options,onProseWidth:value=>widths.push(value)});
    await store.open();assert.equal(store.getSnapshot()!.values!.maxProseWidth,100);
    await store.change(1);assert.equal(store.getSnapshot()!.values!.maxProseWidth,120);
    const saved=await readConfigScope({...options,scope:'project-user'});
    assert.equal(saved.ui?.maxProseWidth,120);assert.equal(saved.ui?.theme,'noir');
    assert.equal((await readConfigScope({...options,scope:'project'})).ui?.maxProseWidth,100);
    assert.equal((await readConfigScope({...options,scope:'user'})).ui?.maxProseWidth,undefined);
    store.close();await store.open();assert.equal(store.getSnapshot()!.values!.maxProseWidth,120);
    await store.change(1);assert.equal((await loadConfigPanelValues(options)).maxProseWidth,null);
    assert.deepEqual(widths.slice(-2),[120,null]);
  }finally{env.restore();}
});
test('P5-FAILURE failed save keeps the old value, allows retry and never claims success',async()=>{
  const env=hermeticProfile();let fail=true,saved=0;
  const values={maxProseWidth:null,mouse:true,notifications:'auto',exitOutput:'transcript'} as const;
  const store=createConfigPanelStore({paths:env.paths,projectRoot:env.root,io:{load:async()=>values,save:async()=>{if(fail)throw new Error('EACCES');saved++;}}});
  try{
    await store.open();await store.change(1);
    assert.equal(store.getSnapshot()!.values!.maxProseWidth,null);assert.match(store.getSnapshot()!.notice!,/not saved/iu);
    assert.equal(store.getSnapshot()!.busy,false);assert.equal(saved,0);
    fail=false;await store.change(1);assert.equal(saved,1);
  }finally{env.restore();}
});
test('P5-RACE late load never reopens a closed panel; a pending write rejects repeated activation',async()=>{
  const env=hermeticProfile();const values={maxProseWidth:null,mouse:true,notifications:'auto',exitOutput:'transcript'} as const;
  let finish:(v:typeof values)=>void=()=>{};
  const store=createConfigPanelStore({paths:env.paths,projectRoot:env.root,io:{load:()=>new Promise(resolve=>{finish=resolve;})}});
  try{
    const opening=store.open();store.close();finish(values);await opening;assert.equal(store.getSnapshot(),null);
    let release:()=>void=()=>{},calls=0;
    const busy=createConfigPanelStore({paths:env.paths,projectRoot:env.root,io:{load:async()=>values,save:async()=>{calls++;await new Promise<void>(resolve=>{release=resolve;});}}});
    await busy.open();const saving=busy.change(1);await busy.change(1);assert.equal(calls,1);busy.close();release();await saving;assert.equal(busy.getSnapshot(),null);
  }finally{env.restore();}
});
test('P5-OVERLAY identifies scope and restart-only choices without showing raw config names',()=>{
  const content=configPanelOverlay({selected:0,values:{maxProseWidth:null,mouse:true,notifications:'auto',exitOutput:'transcript',questionTimeout:'5m'},busy:false,notice:null});
  const text=JSON.stringify(content);assert.match(text,/Only you, in this project/u);assert.match(text,/next launch/u);
  assert.doesNotMatch(text,/ui\.notifications|project-user/u);assert.equal(content.sections[0]!.lines.length,5);
});

test('P5-DISK-FAILURE a config corrupted after opening is never overwritten; repair allows retry',async()=>{
  const env=hermeticProfile();const store=createConfigPanelStore({paths:env.paths,projectRoot:env.root});
  try{
    await store.open();
    const dir=join(env.paths.projectOverridesRoot,projectId(env.root)),file=join(dir,'config.json');
    await mkdir(dir,{recursive:true});await writeFile(file,'{"ui": BAD');
    await store.change(1);
    assert.equal(await readFile(file,'utf8'),'{"ui": BAD');assert.equal(store.getSnapshot()!.values!.maxProseWidth,null);
    assert.match(store.getSnapshot()!.notice!,/not saved/iu);
    await writeFile(file,'{}');await store.change(1);
    assert.equal(JSON.parse(await readFile(file,'utf8')).ui.maxProseWidth,60);
  }finally{store.close();env.restore();}
});
