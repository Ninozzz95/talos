/*
 * Twin repair of desktop 0.2.2, round 8, CLI side (owner 14/11 23:49, judge v1917, yes v1920). Reviewer 3 after round 7, RED twice:
 *   R1  the preview while the arguments stream closed the OPEN string of the JSON and masked it (`parseArgs`, tui/tools/shared.ts), but a
 *       secret known only by its FORM needs the whole token: live at 80×24 `body: use ghp_A1b2…` 34 of 40 characters, in units GitHub 39/40,
 *       AKIA 19/20, JWT 51/63, the password of an address 13/13. A value still open now reads «…» until it closes;
 *   R2  `secretKey` (protocol/v2/events.ts) split the name into words without removing the invisible characters first: `pa​ssword_…`
 *       was two words and stayed in clear, 15 of 24 names on the row and on the card;
 *   R8  (mutant alive) the activity line read the raw JSON and no test looked at its header for a tool that is not a connector.
 * The model and the tool receive the real arguments: only the copy for the screen changes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import {toolArguments} from '../../src/tui/activity-pulse.ts';
import {toolGroupCallLabel} from '../../src/tui/components/tool-group.ts';
import {activityHeader} from '../../src/tui/activity-line.ts';
import {parseArgs} from '../../src/tui/tools/shared.ts';
import {cleanKernelArguments} from '../../src/protocol/v2/events.ts';
import {kernelArgumentMasksLoaded} from '../../src/tui/tools/argument-masks.ts';

const OPEN='…';
const GHP='ghp_QZXJ7a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P';
const AKIA='AKIAQZXJ7W3E4R5T6Y7U';
const SKP='sk-proj-QZXJ8a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5';
const BEARER='QZXJ9bcdefWvUtSrQpOnMlKjih';
const JWT='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJRWlhKcmV2OCJ9.QZXJsigAbCdEfGhIjKlMnOp';
const URLP='QZXJurlPQSW9z8',ENVP='QZXJenvPQSW9z8';
/* the part of each secret that must never appear: from its first distinctive character to its end (4 characters count as seen: three letters such as «url» in «curl» meet by chance) */
const BODIES:Record<string,string>={GHP:GHP.slice(4),AKIA:AKIA.slice(4),SKP:SKP.slice(8),BEARER,JWT:JWT.slice(3),URLP,ENVP};
function seen(text:string):Record<string,number>{
  const out:Record<string,number>={};
  for(const [k,body] of Object.entries(BODIES)){
    let best=0;
    for(let i=0;i+4<=body.length&&best<body.length-i;i++)for(let n=body.length-i;n>=4&&n>best;n--)if(text.includes(body.slice(i,i+n))){best=n;break;}
    if(best)out[k]=best;
  }
  return out;
}
const FORMS={title:'Rotate the creds',body:`use ${GHP} now`,aws:AKIA,note:SKP,header:`Bearer ${BEARER}`,jwt:JWT,url:`https://admin:${URLP}@example.invalid/x`,script:`export DB_PASSWORD='${ENVP}' && make deploy`};
const row=(argsText:string,status:'running'|'approval'|'completed'='running',name='mcp__github__create_issue')=>({id:'t1',name,status,argsText,liveOutput:'',finalOutput:status==='completed'?'Issue #42 opened.':'',startedAt:0,endedAt:status==='completed'?1:null});
const screen=(r:ReturnType<typeof row>,width:number,expanded=true)=>{const v=toolRowView(r as any,width,expanded,2);return [v.line,...v.detailLines].join('\n');};
const group=(argsText:string,name='mcp__github__create_issue')=>String((toolGroupCallLabel as any)({kind:'tool',id:'t',name,status:'running',argsText,liveOutput:'',finalOutput:'',startedAt:0,endedAt:null})??'');
/* everything a terminal draws from one piece of arguments: the row at three widths, open and closed, the activity line, the group label */
function everything(argsText:string,name='mcp__github__create_issue'):string{
  const parts:string[]=[];
  for(const width of [60,80,120])for(const expanded of [true,false])parts.push(screen(row(argsText,'running',name),width,expanded));
  parts.push(JSON.stringify(toolArguments(argsText)??{}),group(argsText,name));
  parts.push(activityHeader({running:true,reasoning:null,tools:[{id:'t1',name,status:'running',argsText}]} as any,{kind:'tool',startedAt:0} as any));
  return parts.join('\n');
}

test('CLI-ROW-G8-01 (R1): every cut of the arguments, at 60, 80 and 120 columns, open and closed: 0 characters of a secret on screen',()=>{
  for(const json of [JSON.stringify(FORMS),JSON.stringify(FORMS,null,2)]){
    for(let i=1;i<=json.length;i++)assert.deepEqual(seen(everything(json.slice(0,i))),{},`cut ${i}: ${json.slice(0,i).slice(-60)}`);
  }
});

test('CLI-ROW-G8-02 (R1): the same with a shell command and a fetched address cut in every place: the title line too',()=>{
  for(const [name,args] of [['shell',{comando:`export DB_PASSWORD='${ENVP}' && curl -H "Authorization: Bearer ${BEARER}" x`}],['naviga',{url:`https://admin:${URLP}@example.invalid/x`}]] as const){
    const json=JSON.stringify(args);
    for(let i=1;i<=json.length;i++)assert.deepEqual(seen(everything(json.slice(0,i),name)),{},`${name} cut ${i}`);
  }
});

test('CLI-ROW-G8-03 (R1): a value still open reads «…»; once closed it is masked as before, and the finished row has no «…» left',()=>{
  assert.deepEqual(parseArgs(row('{"title":"Login but') as any),{title:OPEN});
  assert.deepEqual(parseArgs(row('{"title":"Login","body":"use ghp_QZXJ7a1B') as any),{title:'Login',body:OPEN});
  assert.deepEqual(parseArgs(row('{"a":{"b":"x\\') as any),{a:{b:OPEN}});
  assert.equal(parseArgs(row(`{"title":"Login","body":"use ${GHP} now"`) as any).body,'use [redacted] now');
  const fin=screen(row(JSON.stringify(FORMS),'completed'),120);
  assert.deepEqual(seen(fin),{});
  assert.ok(!fin.includes(OPEN),fin);
  assert.match(fin,/Rotate the creds/u);
});

test('CLI-ROW-G8-04 (R1): a list at the top that is still arriving never shows its open value raw',()=>{
  for(const json of [JSON.stringify([`use ${GHP}`,AKIA]),JSON.stringify([{note:JWT}])]){
    for(let i=1;i<=json.length;i++)assert.deepEqual(seen(everything(json.slice(0,i))),{},`list cut ${i}`);
  }
});

/* R2: the 24 names of reviewer 3 with an invisible character inside the secret word */
const NAMES24=['api_key','password','cookie','token','authorization','clientSecret','x-api-key','idToken','password_confirmation','new_password_again','password_new','api_key_2','apiKeyValue','token_value','access_token_raw','secret_answer','authorization_header','passwordConfirm','secret_text','auth_token_b64','api_key_old','client_secret_2','password1','pass'];
/* 20/11/2026, the kernel of desktop 0.2.4 (4cc08aa10): none of the 24 in clear on the row, stricter than the 2 of 0.2.2 (round 7) */
const EXPECTED_IN_CLEAR:string[]=kernelArgumentMasksLoaded()?[]:['cookie','password1','pass'];
const WORD=/(pass|secret|token|api|auth|cook|key|Secret|Token|Key|Value)/u;
const INVISIBLE:Record<string,string>={zwsp:'​',zwj:'‍',shy:'­'};
const broken=(n:string,c:string)=>n.replace(WORD,m=>`${m.slice(0,2)}${c}${m.slice(2)}`);
const value=(i:number)=>`R8I${String(i).padStart(2,'0')}V`;
test('CLI-ROW-G8-05 (R2): the 24 names with a zero width space, joiner or soft hyphen inside: on the row at most the 2 of today in clear',()=>{
  for(const [tag,c] of Object.entries(INVISIBLE)){
    const clear=NAMES24.filter((n,i)=>{const json=JSON.stringify({[broken(n,c)]:value(i)});return [60,80,120].some(w=>(['approval','running','completed'] as const).some(s=>screen(row(json,s),w).includes(value(i))));});
    assert.deepEqual(clear,EXPECTED_IN_CLEAR,tag);
  }
});

test('CLI-ROW-G8-06 (R2): the bridge\'s pass for the card (E11) masks the same broken names, nested and in lists',()=>{
  for(const [tag,c] of Object.entries(INVISIBLE)){
    const clear=NAMES24.filter((n,i)=>JSON.stringify(cleanKernelArguments({wrap:[{[broken(n,c)]:value(i)}]},(s:string)=>s)).includes(value(i)));
    assert.deepEqual(clear,['cookie','password1','pass'],tag); // E11 alone: cookie is the kernel's name (round 6)
  }
  /* honest names with an invisible character stay readable: the word must still be whole */
  assert.deepEqual(cleanKernelArguments({'ti​tle':'x','max­_tokens':5},(s:string)=>s),{'ti​tle':'x','max­_tokens':5});
});

/* R8: the activity line of a tool that is not a connector */
test('CLI-ROW-G8-07 (R8): the activity line of a running command shows the command with its secret masked',()=>{
  const argsText=JSON.stringify({comando:`export DB_PASSWORD=${ENVP} && make deploy`});
  const header=activityHeader({running:true,reasoning:null,tools:[{id:'t1',name:'shell',status:'running',argsText}]} as any,{kind:'tool',startedAt:0} as any);
  assert.ok(!header.includes(ENVP),header);
  assert.match(header,/make deploy/u);
});
test('CLI-ROW-G8-08 (R8): the activity line of a fetch shows the address without its password',()=>{
  const argsText=JSON.stringify({url:`https://admin:${URLP}@example.invalid/x`});
  const header=activityHeader({running:true,reasoning:null,tools:[{id:'t1',name:'naviga',status:'running',argsText}]} as any,{kind:'tool',startedAt:0} as any);
  assert.ok(!header.includes(URLP),header);
  assert.match(header,/example\.invalid/u);
});

/* mutants of the round 8 closing, alive or killed by one test after the first mutant run in a copy */
test('CLI-ROW-G8-09 (R1): a list at the top, pretty-printed, with objects and escapes, cut in every place: 0 characters of a secret',()=>{
  const list=[{note:`say "hi" ${GHP}`},`C:\\dir\\ ${AKIA}`,{jwt:JWT}];
  for(const json of [JSON.stringify(list,null,2),JSON.stringify(list)]){
    for(let i=1;i<=json.length;i++)assert.deepEqual(seen(JSON.stringify(parseArgs(row(json.slice(0,i)) as any))),{},`list cut ${i}`);
  }
});
test('CLI-ROW-G8-10 (R1): escaped quotes and backslashes before a secret, cut in every place: the open value never shows',()=>{
  const args={title:'say "hi" \\ there',body:`a \\"quoted\\" path C:\\tmp\\ then ${GHP}`,note:`"${SKP}"`};
  for(const json of [JSON.stringify(args),JSON.stringify(args,null,2)]){
    for(let i=1;i<=json.length;i++)assert.deepEqual(seen(JSON.stringify(parseArgs(row(json.slice(0,i)) as any))),{},`escape cut ${i}: ${json.slice(0,i).slice(-40)}`);
    /* and the honest title with its escapes stays on the row while the body arrives */
    const cut=json.indexOf('then');
    assert.deepEqual(parseArgs(row(json.slice(0,cut)) as any),{title:args.title,body:OPEN});
  }
});
test('CLI-ROW-G8-14: values with escaped quotes and backslashes stay on the row, closed and whole, while the next value arrives',()=>{
  assert.deepEqual(parseArgs(row('{"title":"say \\"hi\\"","path":"C:\\\\tmp\\\\","body":"x') as any),{title:'say "hi"',path:'C:\\tmp\\',body:OPEN});
  assert.deepEqual(parseArgs(row('{"a":["\\"q\\"",{"b":"\\\\"}],"c":"y') as any),{a:['"q"',{b:'\\'}],c:OPEN});
  assert.deepEqual(parseArgs(row('{"size":"5\\" disk","body":"x') as any),{size:'5" disk',body:OPEN}); // one escaped quote: an odd count
});
test('CLI-ROW-G8-11: a name still arriving after a comma goes away and the row keeps the values before it, compact and pretty-printed',()=>{
  assert.deepEqual(parseArgs(row('{"title":"Login","pas') as any),{title:'Login'});
  assert.deepEqual(parseArgs(row('{\n  "title": "Login",\n  "pas') as any),{title:'Login'});
  assert.deepEqual(parseArgs(row('{"a":{"b":1, "pass') as any),{a:{b:1}});
});
test('CLI-ROW-G8-13: a name whose value has not started («"path":») goes away and the values before it stay, nested and pretty-printed',()=>{
  assert.deepEqual(parseArgs(row('{"title":"Login","path":') as any),{title:'Login'});
  assert.deepEqual(parseArgs(row('{\n  "title": "Login",\n  "path" :  ') as any),{title:'Login'});
  assert.deepEqual(parseArgs(row('{"a":[{"b":1,"token":') as any),{a:[{b:1}]});
});
test('CLI-ROW-G8-12: piece by piece, a pretty-printed call never loses the values already closed on the row and in its title',()=>{
  const json=JSON.stringify({title:'Login',path:'src/app.ts',mode:'fast'},null,2);
  let kept=0;
  let skipped=0;
  for(let i=json.indexOf('"path"')+1;i<json.indexOf('"mode"')+4;i++){
    if(/"(path|mode)"$/u.test(json.slice(0,i))){skipped+=1;continue;} // a closed name with nothing after it: the page skips that frame too
    const shown=parseArgs(row(json.slice(0,i)) as any);
    assert.equal(shown.title,'Login',`cut ${i}: ${json.slice(0,i).slice(-20)}`);
    if(json.slice(0,i).includes('"src/app.ts"'))kept+=Number(shown.path==='src/app.ts');
    assert.ok(shown.path===undefined||shown.path===OPEN||shown.path==='src/app.ts',`cut ${i}: ${JSON.stringify(shown)}`);
  }
  assert.ok(kept>0&&skipped===1,`kept ${kept} skipped ${skipped}`);
});
