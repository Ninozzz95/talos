/*
 * Twin repair of desktop 0.2.2, round 7, CLI side (owner 14/11 19:46, judge v1905-v1906). Reviewer 3 after round 6, live at 120×40 on the
 * CLI c15319c65 with the PC kernel 6251ea021: the approval card showed 2 of the 24 secret names in clear (password1, pass), but the TOOL ROW
 * above it printed `api key: R6S00V` and `password: R6S01V` (4/24 on the whole screen). The row's arguments (`tool.args`) passed only the
 * key-form cleaning of the bridge, then `generic-renderer.ts`/`argumentLine` printed them. Now every place that draws a row's arguments
 * reads them through the card's masks (tui/tools/argument-masks.ts: the kernel's `oscuraPerStruttura`, then Gate E11).
 * The kernel of this checkout decides the kernel half: with the 0.2.2 kernel (`oscuraPerStruttura`) the row shows the card's 2 of 24; an
 * older kernel has only its secret forms, and E11 then leaves `cookie` too (said below, measured live on the 0.2.2 kernel).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import {toolArguments} from '../../src/tui/activity-pulse.ts';
import {toolGroupCallLabel} from '../../src/tui/components/tool-group.ts';
/* by a dynamic import: on the base (no argument-masks.ts) each test is red on its own, not the whole file */
const masks:any=await import('../../src/tui/tools/argument-masks.ts').catch(()=>({}));
const kernelArgumentMasksLoaded=():boolean=>typeof masks.kernelArgumentMasksLoaded==='function'?masks.kernelArgumentMasksLoaded():false;
const maskToolArguments=(value:unknown):unknown=>masks.maskToolArguments(value);

const NAMES24=['api_key','password','cookie','token','authorization','clientSecret','x-api-key','idToken','password_confirmation','new_password_again','password_new','api_key_2','apiKeyValue','token_value','access_token_raw','secret_answer','authorization_header','passwordConfirm','secret_text','auth_token_b64','api_key_old','client_secret_2','password1','pass'];
const value=(i:number)=>`R7S${String(i).padStart(2,'0')}V`;
const ARGS24=Object.fromEntries(NAMES24.map((n,i)=>[n,value(i)]));
/* 20/11/2026, the kernel of desktop 0.2.4 (4cc08aa10, forme-di-segreto.mjs: `pass` is a secret as a field name, and so is password1):
   the row now shows NONE of the 24 in clear, stricter than the 2 of 0.2.2. Only ever stricter here, never wider. */
const EXPECTED_IN_CLEAR:string[]=kernelArgumentMasksLoaded()?[]:['cookie','password1','pass'];
const row=(argsText:string,status:'running'|'approval'|'completed'='running',name='mcp__github__create_issue')=>({id:'t1',name,status,argsText,liveOutput:'',finalOutput:status==='completed'?'Issue #42 opened.':'',startedAt:0,endedAt:status==='completed'?1:null});
const screen=(r:ReturnType<typeof row>,width:number)=>{const v=toolRowView(r as any,width,true,2);return [v.line,...v.detailLines].join('\n');};
const inClear=(text:string)=>NAMES24.filter((_n,i)=>text.includes(value(i)));

test('CLI-ROW-G7-01: the tool row of a connector at 80 and 120 columns, expanded, running and finished: at most the card\'s names in clear',()=>{
  for(const width of [80,120])for(const status of ['approval','running','completed'] as const){
    const text=screen(row(JSON.stringify(ARGS24),status),width);
    assert.ok(inClear(text).every(n=>EXPECTED_IN_CLEAR.includes(n)),`${width} ${status}\n${text}`);
    /* the expanded row keeps 12 lines: each name alone, so all 24 reach the screen */
    const alone=NAMES24.filter((n,i)=>screen(row(JSON.stringify({[n]:value(i)}),status),width).includes(value(i)));
    assert.deepEqual(alone,EXPECTED_IN_CLEAR,`${width} ${status}`);
  }
});

test('CLI-ROW-G7-02: the preview while the arguments arrive piece by piece never shows more than the final row (a value cut between two pieces)',()=>{
  const json=JSON.stringify({title:'Login',password:'QZXJ7pwd',api_key:'QZXJ8key',config:{db:{password:'QZXJ9nest'}},tags:[{token:'QZXJ6list'}]});
  let shownTitle=0;
  for(let i=1;i<=json.length;i++){
    const text=screen(row(json.slice(0,i)),120);
    for(const s of ['QZXJ7','QZXJ8','QZXJ9','QZXJ6'])assert.ok(!text.includes(s),`prefix ${i}: ${s}\n${text}`);
    if(text.includes('Login'))shownTitle+=1;
  }
  assert.ok(shownTitle>0,'the preview shows the honest value');
});

test('CLI-ROW-G7-03: the activity line and the tool group read the masked arguments too',()=>{
  const args=toolArguments(JSON.stringify({password:'QZXJ7pwd',api_key:'QZXJ8key',path:'src/a.ts'}))!;
  assert.ok(!JSON.stringify(args).includes('QZXJ7')&&!JSON.stringify(args).includes('QZXJ8'),JSON.stringify(args));
  assert.equal(args.path,'src/a.ts');
  const label=toolGroupCallLabel({...row(JSON.stringify({comando:'export DB_PASSWORD=hunter2Secret && make'}),'running','shell'),kind:'tool'} as any);
  assert.ok(!label.includes('hunter2Secret'),label);
});

test('CLI-ROW-G7-04: masks of the row = kernel then E11, as on the card; nested and listed names; usage counters stay',()=>{
  const m=maskToolArguments({outer:{db:{secret_answer:'VALDEEP',password:'VALPWD'}},list:[{api_key_old:'VALLIST'}],total_tokens:1234,note:'plain'}) as any;
  const text=JSON.stringify(m);
  for(const s of ['VALDEEP','VALPWD','VALLIST'])assert.ok(!text.includes(s),text);
  assert.equal(m.total_tokens,1234);
  assert.equal(m.note,'plain');
});

test('CLI-ROW-G7-05: arguments that are not JSON are a value with the secret forms masked',()=>{
  const text=screen(row('export DB_PASSWORD=hunter2Secret'),120);
  assert.ok(!text.includes('hunter2Secret'),text);
});

test('CLI-ROW-G7-06: a pretty-printed call streamed at 80 columns: no prefix shows a secret (a value cut between two pieces)',()=>{
  const json=JSON.stringify({query:'open issues',password:'QZXK1pwd',client_secret_2:'QZXK2sec',api_key:'QZXK3key'},null,2);
  let shownQuery=0;
  for(let i=1;i<=json.length;i++){
    const text=screen(row(json.slice(0,i)),80);
    for(const s of ['QZXK1','QZXK2','QZXK3'])assert.ok(!text.includes(s),`prefix ${i}: ${s}\n${text}`);
    if(text.includes('open issues'))shownQuery+=1;
  }
  assert.ok(shownQuery>0,'the preview shows the honest value');
});

test('CLI-ROW-G7-07: a text that is not JSON at 80 columns, waiting and finished: the secret forms are masked, the rest stays',()=>{
  for(const status of ['approval','completed'] as const){
    const text=screen(row('curl -u admin --data "password=QZXK4pwd" https://example.test/login',status),80);
    assert.ok(!text.includes('QZXK4pwd'),`${status}\n${text}`);
    assert.ok(text.includes('example.test'),`${status}\n${text}`);
  }
});

test('CLI-ROW-G7-08: the activity line masks a nested and a listed secret and keeps the path it shows',()=>{
  const args=toolArguments(JSON.stringify({path:'docs/readme.md',config:{db:{password:'QZXK5nest'}},list:[{token:'QZXK6list'}]}))!;
  const text=JSON.stringify(args);
  for(const s of ['QZXK5','QZXK6'])assert.ok(!text.includes(s),text);
  assert.equal(args.path,'docs/readme.md');
});

test('CLI-ROW-G7-09: the tool group line of a search and of a test command masks a secret form in the text it shows',()=>{
  const label=toolGroupCallLabel({...row(JSON.stringify({testo:'export DB_PASSWORD=QZXK7abcdef',dentro:'src'}),'running','cerca'),kind:'tool'} as any);
  assert.ok(!label.includes('QZXK7abcdef'),label);
  assert.ok(label.includes('src'),label);
  const shell=toolGroupCallLabel({...row(JSON.stringify({comando:'export API_TOKEN=QZXK8secret && make deploy'}),'running','prova'),kind:'tool'} as any);
  assert.ok(!shell.includes('QZXK8secret'),shell);
});
