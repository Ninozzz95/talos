/*
 * P11 (owner, 2026-09-25, "quando cambio tema crasha il processo"): crossing `mono` in /theme remounted the whole app and
 * its unmount closed the session controller. Ink's Box adds a background Provider around its children only when it has
 * a colour, and `mono` has none, so the frame changed shape. The frame now always has a background colour when the
 * session paints one (`UNPAINTED_BACKGROUND` for a theme without one), which Ink leaves unpainted. The acceptance proof is
 * s25; here: the frame contract, the Ink behaviour it relies on, and the mount count across calm → mono → calm.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {PassThrough} from 'node:stream';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {UNPAINTED_BACKGROUND,terminalFrameProps} from '../../src/tui/components/terminal-shell.ts';

const require=createRequire(import.meta.url);
const FULL={mode:'full' as const,alternateScreen:true,paintBackground:true,fallbackReason:null};

test('P11: a painted session always gives the frame a background colour, the unpainted one for a theme without it',()=>{
  assert.equal(terminalFrameProps({session:FULL,background:'#1e1f22',rows:20,columns:80,platform:'linux'}).backgroundColor,'#1e1f22');
  assert.equal(terminalFrameProps({session:FULL,rows:20,columns:80,platform:'linux'}).backgroundColor,UNPAINTED_BACKGROUND);
  assert.equal('backgroundColor' in terminalFrameProps({session:{...FULL,mode:'mono',paintBackground:false},rows:20,columns:80,platform:'linux'}),false,'a session that never paints has no background at all');
});

test('P11: Ink leaves the unpainted background name uncoloured (the contract the frame relies on)',async()=>{
  /* `ink/build/colorize.js` is not exported: loaded by path from Ink's own entry, with the chalk instance Ink uses set to
     full colour for this test (a test process has no terminal, so chalk would colour nothing and prove nothing). */
  const inkEntry=require.resolve('ink');
  const {default:colorize}=await import(pathToFileURL(join(dirname(inkEntry),'colorize.js')).href);
  const {default:chalk}=await import(pathToFileURL(createRequire(inkEntry).resolve('chalk')).href);
  const level=chalk.level;chalk.level=3;
  try{
    assert.equal(colorize('   ',UNPAINTED_BACKGROUND,'background'),'   ');
    assert.notEqual(colorize('   ','#1e1f22','background'),'   ','a real colour is painted (the check can fail)');
  }finally{chalk.level=level;}
});

test('P11: the app under the frame is mounted once across calm → mono → calm',async()=>{
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const stdout:any=Object.assign(new EventEmitter(),{columns:80,rows:20,isTTY:true,write(){return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  let mounts=0,unmounts=0;
  const App=()=>{React.useEffect(()=>{mounts++;return()=>{unmounts++;};},[]);return React.createElement(Ink.Text,null,'app');};
  let background:string|undefined='#1e1f22';const listeners=new Set<()=>void>();
  const store={subscribe:(l:()=>void)=>{listeners.add(l);return()=>listeners.delete(l);},get:()=>background};
  const set=(next:string|undefined)=>{background=next;for(const l of [...listeners])l();};
  const Root=()=>{const bg=React.useSyncExternalStore(store.subscribe,store.get,store.get);return React.createElement(Ink.Box,terminalFrameProps({session:FULL,...(bg?{background:bg}:{}),rows:20,columns:80,platform:'linux'}),React.createElement(App));};
  const app=Ink.render(React.createElement(Root),{stdout,stdin,stderr:stdout,exitOnCtrlC:false,patchConsole:false,interactive:true});
  const settle=()=>new Promise(resolve=>setTimeout(resolve,60));
  try{
    await settle();
    set(undefined);await settle();   // mono
    set('#1e1f22');await settle();  // calm again
    assert.equal(mounts,1,`the app was mounted ${mounts} times (unmounted ${unmounts})`);
    assert.equal(unmounts,0);
  }finally{app.unmount();}
});
