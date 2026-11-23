/*
 * Stage 7.2 (owner 01/10 «ogni comando deve avere il suo pannello», the approved mockup to the letter; registro 12). The one
 * sheet engine against the mockup's golden frames (lavoro/mockup-golden, extracted into fixtures/panels-golden.json): seven
 * panels built with the mockup's own data (its `PANELS` in the scene «Pannelli: sessione») must draw the same rows, text and
 * style runs, at 120×40 and 80×24, in the height the mockup gives them.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {one,panelHeight,panelRows,S,wrap,type Panel,type SegRow} from '../../src/tui/panel/sheet.ts';

const golden=JSON.parse(readFileSync(new URL('./fixtures/panels-golden.json',import.meta.url),'utf8')) as {frames:Record<string,{height:number;footRows:number;text:string[];style:string[]}>};
const text=(rows:SegRow[])=>rows.map(row=>row.map(s=>s.text).join('').replace(/\s+$/u,''));
/* the golden style format: runs `start+length:roles` per row (roles sorted, unstyled cells left out) */
const style=(rows:SegRow[])=>rows.map(row=>{let x=0;const out:Array<{start:number;end:number;roles:string}>=[];
  for(const s of row){const n=[...s.text].length;const roles=[...s.roles].sort().join(',');const last=out.at(-1);
    if(roles&&n){if(last&&last.roles===roles&&last.end===x)last.end=x+n;else out.push({start:x,end:x+n,roles});}x+=n;}
  return out.map(o=>`${o.start}+${o.end-o.start}:${o.roles}`).join(' ');});
const fitTo=(rows:SegRow[],w:number)=>rows.map(row=>{const out:SegRow=[];let n=0;for(const s of row){if(n>=w)break;const t=[...s.text].slice(0,w-n).join('');if(t)out.push({...s,text:t});n+=[...t].length;}return out;});

const LAST='The login e2e test is flaky. Find out why and fix it.';
/* the mockup's PANELS (MOCKUP-FASE-UI-2026-10-01.html:569-605), in the state of the golden scene */
const PANELS:Record<string,()=>Panel>={
  'cmd-busy':()=>one('While TALOS works, Enter…','your choice for this project',{kind:'list',sel:0,radio:true,twoLine:true,enter:'use',items:[
    {label:'Queues the message',current:true,desc:'sent when the turn ends; see and edit it in /queue'},
    {label:'Steers the turn',desc:'added to the current turn at its next step'},
    {label:'Interrupts and sends',desc:'stops the turn, then sends your message'}]}),
  'cmd-effort':()=>one('Reasoning effort','qwen3-coder offers low, medium, high',{kind:'form',sel:0,submit:'Use',fields:[{label:'Effort',type:'slider',options:['low','medium','high'],value:'medium',help:'Higher thinks longer before answering: better on hard problems, slower and pricier.'}],
    after:()=>[[S('')],[S('   low     quick answers, small edits','dim')],[S('   medium  most coding work','dim')],[S('   high    hard bugs, design, long plans','dim')]]}),
  'cmd-plan':()=>one('Plan mode','',{kind:'list',sel:0,radio:true,twoLine:true,enter:'use',top:()=>[[S('  TALOS reads and proposes a plan; it changes nothing until you approve.','dim')],[S('')]],items:[
    {label:'Plan first',current:false,desc:'TALOS proposes; you approve, edit or keep planning'},{label:'Work normally',current:true,desc:'back to asking before edits'}]}),
  'cmd-retry':()=>one('Send again','',{kind:'list',sel:0,enter:'choose',top:w=>[[S('  Your last message','faint')],...wrap('› '+LAST,w-4).map(line=>[S('  '+line,'b')]),[S('')]],
    items:[{label:'Send it again'},{label:'Edit it first'},{label:'Cancel'}]}),
  'cmd-tui':()=>one('View','',{kind:'list',sel:0,radio:true,twoLine:true,enter:'use',items:[
    {label:'Fullscreen',current:true,desc:'TALOS draws the whole screen: mouse, panels, search; memory stays flat'},
    {label:'Classic',current:false,desc:'finished messages go to your terminal scrollback: native search and selection'}]}),
  'cmd-clear':()=>one('Clear','',{kind:'list',sel:0,twoLine:true,enter:'choose',items:[
    {label:'Clear the screen',desc:'the conversation stays; ctrl+o still finds everything'},
    {label:'Start a new conversation',desc:'this one is saved as "Flaky login test" in /resume'},
    {label:'Cancel',desc:'leave everything as it is'}]}),
  'cmd-rename':()=>one('Rename','shown in /resume, the terminal title and exports',{kind:'form',sel:0,submit:'Rename',fields:[{label:'Name',type:'text',value:'Flaky login test',help:'Up to 60 characters.'}]}),
};

for(const [size,w] of [['120x40',120],['80x24',80]] as const){
  for(const [name,make] of Object.entries(PANELS)){
    test(`${name} at ${size}: the sheet draws the mockup's rows, text and style, in the mockup's height`,()=>{
      const frame=golden.frames[`${size}/${name}`]!;const panel=make();
      const H=panelHeight(panel,w,frame.height,frame.footRows,0);
      assert.equal(H,frame.text.length,'the height');
      const rows=fitTo(panelRows(panel,w,H),w);
      assert.deepEqual(text(rows),frame.text,'the text');
      assert.deepEqual(style(rows),frame.style,'the style');
    });
  }
}

test('every key of the key row, the close mark, the tabs and the items carry the mockup\'s click verbs',()=>{
  const panel:Panel={title:'Memory',sub:'what TALOS remembers',tab:0,tabs:[
    {name:'Project',body:{kind:'list',sel:0,filterable:true,keys:[{key:'n',label:'new',adds:true},{key:'space',label:'toggle'}],enter:'open',items:[{label:'Use pnpm'},{label:'Vitest units'}]}},
    {name:'You',body:{kind:'list',sel:0,items:[]}}]};
  const rows=panelRows(panel,120,12);
  const actions=rows.flat().map(s=>s.action).filter(Boolean);
  for(const verb of ['pkey:Escape','ptab:0','ptab:1','pitem:0','pitem:1','pkey:Enter','pkey:n','pkey: ','pkey:/','pkey:Tab'])assert.ok(actions.includes(verb),verb);
  const form:Panel=one('Export','',{kind:'form',sel:0,submit:'Save to file',alt:'Copy to clipboard',fields:[{label:'Format',type:'choice',options:['Markdown','JSON'],value:'Markdown'},{label:'Tool output',type:'bool',value:false}]});
  const formActions=panelRows(form,120,12).flat().map(s=>s.action).filter(Boolean);
  for(const verb of ['pfield:0','pfield:1','pfopt:0:0','pfopt:0:1','pfopt:1:t','pkey:Enter','palt'])assert.ok(formActions.includes(verb),verb);
});

test('owner 03/10: a row of keys that does not fit goes on two rows; the sheet grows by one where there is room',()=>{
  /* eight items: above the 10 rows every sheet has at least */
  const items=Array.from({length:8},(_,i)=>({id:String(i),label:'Item '+i}));
  const keys=[{key:'n',label:'new'},{key:'e',label:'edit'},{key:'d',label:'delete'},{key:'v',label:'open in editor'}];
  const short:Panel=one('T','',{kind:'list',sel:0,items,keys:keys.slice(0,1)});
  const long:Panel=one('T','',{kind:'list',sel:0,items,keys,enter:'attach'});
  const h=panelHeight(short,60,40,3,0),H=panelHeight(long,60,40,3,0);
  assert.equal(H,h+1,'the sheet grows by the second row of keys');
  const rows=panelRows(long,60,H).map(row=>row.map(s=>s.text).join('').trimEnd());
  assert.equal(rows.length,H,'every row counted');
  assert.deepEqual(rows.slice(-2),[' ↑/↓ move   enter attach   n new   e edit   d delete',' v open in editor   esc close'],'the first row filled, split between keys');
  assert.equal(rows.at(-3),'','the edit row stays above the keys');
  assert.ok(rows.slice(-2).every(line=>[...line].length<=60));
  /* at its tallest the body gives up a row instead */
  const capped=panelRows(long,60,h);assert.equal(capped.length,h);
});
