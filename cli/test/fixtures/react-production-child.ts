/* Child of test/tui/react-production.test.ts: a clean process loads React the way the product does — through the TUI's
   module loader (`tui`) or through the project trust prompt, the other place that draws with Ink (`trust-prompt`) — then
   reports which React builds RAN, what NODE_ENV is left behind, and how many performance measures the renders leave in
   Node's timeline. The parent sets NODE_ENV (or not) before starting it. */
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
const mode=process.argv[2]??'tui';
const before=process.env.NODE_ENV;
let after:string|undefined;
if(mode==='trust-prompt'){
  const {PROJECT_TRUST_GRACE_MS,runProjectTrustPrompt}=await import('../../src/tui/project-trust-prompt.ts');
  /* the grace runs from when the question is first drawn: its first write (the import of Ink comes before it) */
  let drawn=(_at:number)=>{};const opened=new Promise<number>(resolve=>{drawn=resolve;});
  const stdout:any=Object.assign(new EventEmitter(),{columns:80,rows:24,isTTY:true,write(){drawn(Date.now());return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  const root='C:\\Users\\dev\\work\\project';
  const assessment:any={trusted:false,reason:'NO_PROJECT_RESOURCES',workspace:{requestedRoot:root,canonicalRoot:root,gitRoot:null,nestedRepository:false,identityHash:'workspace'},resources:[],storeSchema:null,migrationRequired:false,folder:{decided:false,source:null,path:null,sessionOnly:false,parent:'C:\\Users\\dev\\work'}};
  const answer=runProjectTrustPrompt({assessment,nestedRepositories:[]},{stdin,stdout,env:{TERM:'xterm-256color'}});
  after=process.env.NODE_ENV;
  /* keys only past the grace (one second since judge v2242), or the question ignores them and renders nothing */
  const first=await opened;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,first+PROJECT_TRUST_GRACE_MS+150-Date.now())));
  for(let n=0;n<30;n++){await new Promise(resolve=>setTimeout(resolve,20));stdin.write(n%2?'\u001b[A':'\u001b[B');}
  await new Promise(resolve=>setTimeout(resolve,350));stdin.write('\u001b');await answer;
}else{
  const {loadTuiModules}=await import('../../src/tui/run.ts');
  const {React,Ink}=await loadTuiModules();
  after=process.env.NODE_ENV;
  const stdout=Object.assign(new PassThrough(),{columns:80,rows:24,isTTY:false});stdout.resume();
  const App=({n}:{n:number})=>React.createElement(Ink.Box,{flexDirection:'column'},React.createElement(Ink.Text,null,`frame ${n}`),React.createElement(Ink.Text,null,'x'.repeat(n%40)));
  const app=Ink.render(React.createElement(App,{n:0}),{stdout:stdout as any,stdin:new PassThrough() as any,debug:true,patchConsole:false,exitOnCtrlC:false});
  for(let n=1;n<=200;n++){app.rerender(React.createElement(App,{n}));await new Promise(resolve=>setImmediate(resolve));}
  app.unmount();
}
const require=createRequire(import.meta.url);
/* Only modules that RAN: Node's ESM loader also leaves empty, never-executed entries (loaded=false) for both builds when it
   scans `react/index.js` for its named exports (measured 01/10), and those must not count. */
const cached=Object.entries(require.cache).filter(([,module])=>module?.loaded).map(([path])=>path.replace(/\\/g,'/'));
const builds=cached.filter(path=>/\/node_modules\/(react|react-reconciler|scheduler)\/cjs\//.test(path)).map(path=>path.replace(/^.*\/node_modules\//,''));
const measures=performance.getEntriesByType('measure').length;
process.stdout.write(JSON.stringify({before:before??null,after:after??null,builds,measures})+'\n');
process.exit(0);
