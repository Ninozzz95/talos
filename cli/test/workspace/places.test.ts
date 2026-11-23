/* C11c (A2): where New session's filters take their rows from: the PC's sources, read, never invented. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {diskPlaces,disksSoon,forgetDiskProbe,listDisks,quickPlaces,recentPlaces} from '../../src/workspace/places.ts';

const folders=(...paths:string[])=>async(path:string)=>{if(paths.includes(path.replace(/\\/gu,'/')))return{isDirectory:()=>true};throw new Error('ENOENT');};

test('Recently used: the latest first, once each, no sub-agent, only folders that are still there, at most six',async()=>{
  const sessions=[
    {path:'C:/p/old',at:'2026-11-01T10:00:00Z'},{path:'C:/p/new',at:'2026-11-19T10:00:00Z'},{path:'c:\\p\\NEW\\',at:'2026-11-18T10:00:00Z'},
    {path:'C:/p/child',parent:'x',at:'2026-11-19T11:00:00Z'},{path:'C:/p/gone',at:'2026-11-19T09:00:00Z'},{path:null},
    ...['a','b','c','d','e','f'].map((name,index)=>({path:`C:/q/${name}`,at:`2026-10-0${index+1}T00:00:00Z`})),
  ];
  const places=await recentPlaces(sessions,{statFn:folders('C:/p/old','C:/p/new','c:/p/NEW/','C:/p/child','C:/q/a','C:/q/b','C:/q/c','C:/q/d','C:/q/e','C:/q/f')});
  assert.deepEqual(places.map(place=>place.path),['C:/p/new','C:/p/old','C:/q/f','C:/q/e','C:/q/d','C:/q/c']);
  assert.equal(places[0]!.name,'new');
});

test('Recently used: a folder whose check hangs is left out after the cap, it does not hold the page',async()=>{
  const started=Date.now();
  const places=await recentPlaces([{path:'C:/slow',at:'2026-11-19T00:00:00Z'},{path:'C:/fast',at:'2026-11-18T00:00:00Z'}],{capMs:50,
    statFn:path=>path==='C:/slow'?new Promise(()=>{}):Promise.resolve({isDirectory:()=>true})});
  assert.deepEqual(places.map(place=>place.path),['C:/fast']);assert.ok(Date.now()-started<1000);
});

test('Quick pick: Desktop, Documents, Downloads in the mockup\'s order, only those that exist',async()=>{
  const places=await quickPlaces({home:'C:/Users/me',statFn:folders('C:/Users/me/Downloads','C:/Users/me/Desktop')});
  assert.deepEqual(places.map(place=>place.name),['Desktop','Downloads']);
  assert.match(places[0]!.path,/Users[\\/]me[\\/]Desktop$/u);
  assert.deepEqual(await quickPlaces({home:''}),[]);
  const all=await quickPlaces({home:'C:/Users/me',statFn:folders('C:/Users/me/Downloads','C:/Users/me/Documents','C:/Users/me/Desktop')});
  assert.deepEqual(all.map(place=>place.name),['Desktop','Documents','Downloads']);
});

test('Disk: on Windows the drives that answer, the system drive first; elsewhere the root',async()=>{
  assert.deepEqual(await listDisks({platform:'win32',system:'D:\\',statFn:folders('C:/','D:/','E:/')}),['D:\\','C:\\','E:\\']);
  assert.deepEqual(await listDisks({platform:'linux'}),['/']);
});

test('Disk: the drives of the known folders join the probed ones, once each, named as the mockup names them',()=>{
  assert.deepEqual(diskPlaces(['C:\\'],['c:/work/here','D:\\other','C:\\x'],'win32'),[{name:'C:',path:'C:\\'},{name:'D:',path:'D:\\'}]);
  assert.deepEqual(diskPlaces([],['/home/me/p'],'linux'),[{name:'/',path:'/'}]);
});

test('Disk: one probe for the run; the page waits only a moment for it and the next opening has it',async()=>{
  forgetDiskProbe();let calls=0;let finish:(roots:string[])=>void=()=>{};
  const list=()=>{calls+=1;return new Promise<string[]>(done=>{finish=done;});};
  assert.deepEqual(await disksSoon(20,list),[],'not ready: nothing yet, the page opens');
  finish(['C:\\','D:\\']);
  assert.deepEqual(await disksSoon(20,list),['C:\\','D:\\']);
  assert.equal(calls,1);forgetDiskProbe();
});

test('the start never loads it: no file imports it statically, the page loads it with import() (MAPPA-RIDISEGNO §4)',()=>{
  const app=readFileSync(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.doesNotMatch(app,/^import[^\n]*workspace\/places/mu);
  assert.match(app,/await import\('\.\.\/workspace\/places\.ts'\)/u);
});
