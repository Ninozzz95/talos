/*
 * Stage 7.2 (owner 01/10 «ogni comando deve avere il suo pannello», the approved mockup to the letter; registro 12). The ONE
 * sheet every command's panel is drawn with, ported function by function from the mockup (MOCKUP-FASE-UI-2026-10-01.html:
 * `one`, `panelHeight`, `panelRows`, `hintRow`, `renderBody`, `itemRows2`, `listBody`, `formBody`, `progressBody`,
 * `diffBody`): a title row `── Title sub ──── ✕`, tabs when there are several, a body (a list with an optional detail beside
 * or under it, a form, a progress, a diff, or plain info rows), the row of an edit in place, and the row of keys. Segments
 * carry the mockup's roles (styled-rows.ts gives them its colours) and its click verbs (`pkey`, `ptab`, `pitem`, `pfield`,
 * `pfopt`, `palt`; owner 02/10: panel clicks come with the panels). Pure: the rows for a width and a height, nothing else.
 * Widths are cells (text-width.ts), the mockup's code points for the narrow text it draws.
 */
import {displayWidth,splitGraphemes} from '../text-width.ts';
import type {StyledSegment} from '../components/styled-rows.ts';
import {t} from '../../i18n/index.ts';

export type Seg=StyledSegment;
export type SegRow=Seg[];
/** A segment: its text, the mockup's roles («acc b»), and the click verb it carries. */
/* review 01/11 (ALTO 2): pages draw text from outside (web research, tool results, MCP servers' descriptions, forged tools): a control or
   bidi character never reaches the terminal (ESC starts an OSC 52 clipboard write), it becomes a space. One place, every segment. */
const UNSAFE_TEXT=/[\p{Cc}\p{Bidi_Control}\u2028\u2029]/u,UNSAFE_ALL=/[\p{Cc}\p{Bidi_Control}\u2028\u2029]/gu;
export const inertText=(text:string)=>UNSAFE_TEXT.test(text)?text.replace(UNSAFE_ALL,' '):text;
export const S=(text:string,roles:string|readonly string[]='',action?:string):Seg=>({text:inertText(String(text)),roles:typeof roles==='string'?roles.split(' ').filter(Boolean):[...roles],...(action?{action}:{})});
const len=(text:string)=>displayWidth(text);
function cells(text:string,width:number):string{let out='',used=0;for(const g of splitGraphemes(text)){const w=displayWidth(g);if(used+w>width)break;out+=g;used+=w;}return out;}
export const pad=(text:string,width:number)=>len(text)>=width?cells(text,width):text+' '.repeat(width-len(text));
export const trunc=(text:string,width:number)=>len(text)>width?cells(text,Math.max(0,width-1))+'…':text;
/** The row cut or filled to exactly `width` cells (the filler takes `fill`'s roles). */
export function fit(row:readonly Seg[],width:number,fill=''):SegRow{
  const out:SegRow=[];let used=0;
  for(const segment of row){if(used>=width)break;const take=cells(segment.text,width-used);if(take)out.push({...segment,text:take});used+=len(take);}
  if(used<width)out.push(S(' '.repeat(width-used),fill));
  return out;
}
/** The mockup's word wrap: words kept whole unless longer than the row. */
export function wrap(text:string,width:number):string[]{
  const out:string[]=[];
  for(const para of String(text).split('\n')){
    if(!para){out.push('');continue;}
    let line='';
    for(const word of para.split(/(\s+)/u)){
      if(len(line+word)>width&&line.trim()){out.push(line.replace(/\s+$/u,''));line=word.replace(/^\s+/u,'');}else line+=word;
      /* tester R13: a path too long for the row goes to the next one after a slash, not in the middle of a name */
      while(len(line)>width){const cut=cells(line,width);const at=Math.max(cut.lastIndexOf('/'),cut.lastIndexOf('\\'));const piece=at>=Math.floor(cut.length/3)?cut.slice(0,at+1):cut;out.push(piece);line=line.slice(piece.length);}
    }
    out.push(line.replace(/\s+$/u,''));
  }
  return out;
}
export const SPIN=['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

/* `id`: what the adapter knows the item by (never drawn); `search`: more words the filter finds it by (never drawn) */
export type PanelItem={id?:string;/* C7a: the heading it stands under, in a list in that order */group?:string;search?:string;label:string;desc?:string;meta?:string;badge?:string;badgeRoles?:string|readonly string[];descRoles?:string;current?:boolean;done?:boolean};
export type PanelKey={key:string;label:string;/** offered only when the row under the cursor passes (tester 01/11: no «s stop» on a finished command) */forItem?:(item:PanelItem)=>boolean;/** usable with no item, e.g. «n new» on an empty list */adds?:boolean;/** works, and another row says it */hidden?:boolean};
type Rows=(width:number)=>SegRow[];
export type ListBody={kind:'list';items:readonly PanelItem[];sel:number;twoLine?:boolean;radio?:boolean;check?:boolean;toggle?:boolean;split?:number;wideDetailOnly?:boolean;
  filterable?:boolean;filter?:string;filtering?:boolean;empty?:string;/** false: the empty line names no key (the head already says what to do, e.g. Doctor) */emptyAdd?:boolean;enter?:string;keys?:readonly PanelKey[];lr?:boolean;lrLabel?:string;
  top?:Rows;extra?:Rows;detail?:(item:PanelItem,width:number)=>SegRow[];
  /* B2, pages only: the filters above the list, `[` and `]` change them; no `match` means every item */
  filters?:ReadonlyArray<{name:string;match?:(item:PanelItem)=>boolean;/* said when this filter shows nothing: the list's own `empty` was fixed at build and outlived a Tab (tester N1) */empty?:string}>;filterAt?:number;
  /* C11b (bozzetto-cli-retro/index.html:1154): Projects draws its one filter «All N» too; every other list keeps one filter alone hidden */oneFilter?:boolean};
/* `off`: options shown but not offered yet (owner 03/10, the Settings sheet's «Italiano · coming»): drawn faint, skipped by ←/→ */
export type FormField={label:string;type:'bool'|'choice'|'slider'|'text';value:string|boolean;options?:readonly string[];off?:readonly string[];mask?:boolean;help?:string;
  /* Frontend 01/11: what an empty text field means now (e.g. the editor in use), drawn faint and never saved */placeholder?:string};
export type FormBody={kind:'form';fields:readonly FormField[];sel:number;submit?:string;alt?:string;after?:Rows;keys?:readonly PanelKey[]};
export type ProgressStep={label:string;state:'pending'|'run'|'ok'|'warn'|'fail';detail?:string;fix?:string};
export type ProgressBody={kind:'progress';steps:readonly ProgressStep[];result?:Rows;keys?:readonly PanelKey[]};
export type DiffFile={path:string;add:number;del:number;note:string;hunks:readonly string[]};
export type DiffBody={kind:'diff';files:readonly DiffFile[];sel:number;keys?:readonly PanelKey[];/* stage 7.16: said when there is no file */empty?:string;/* B2: how far the file is scrolled on a page */off?:number};
export type InfoBody={kind:'info';lines:(width:number,height?:number,now?:number)=>SegRow[];keys?:readonly PanelKey[];/* B2: how far it is scrolled on a page */off?:number;/* drawn to fit: ↑/↓ are its own keys */fixed?:boolean};
export type PanelBody=ListBody|FormBody|ProgressBody|DiffBody|InfoBody;
export type Panel={title:string;sub?:string;tab:number;tabs:ReadonlyArray<{name:string;body:PanelBody;/* the line under the title, when a tab has its own */sub?:string}>;
  edit?:{label:string;value:string;mask?:boolean}|null;confirmDel?:number|null;
  /* B2: shown as a page (page.ts): `[`, `]` and `?` are keys here, and `moreKeys` is the second row of keys */
  page?:boolean;moreKeys?:boolean;/* C4, pages: rows that stay over every tab */head?:(width:number)=>SegRow[];/* C6: what a second `d` deletes, when it is more than the row */confirmWords?:string};

/** A panel of one body (the mockup's `one`). */
export const one=(title:string,sub:string,body:PanelBody):Panel=>({title,sub,tab:0,tabs:[{name:title,body}]});

/** The items a list shows: all of them, or those whose label, text or meta hold the filter. */
export function listItems(body:ListBody):readonly PanelItem[]{
  const filter=(body.filter??'').toLowerCase();
  const chosen=body.filters?.[body.filterAt??0]?.match;const among=chosen?body.items.filter(chosen):body.items;
  return filter?among.filter(item=>`${item.label} ${item.desc??''} ${item.meta??''} ${item.search??''}`.toLowerCase().includes(filter)):among;
}

/* Frontend 01/11: the state is what the eye runs down a list, so the badges stand in one column and the metas in the next, each as wide as
   the widest of the list. The label comes first (up to 24 cells, or its own length): the meta column gives way for it, cut at its end; when
   even the badges leave the label less than that, each row keeps its own widths as before */
type Columns={badge:number;meta:number}|null;
function listColumns(items:readonly PanelItem[],lw:number,markW:number):Columns{
  const badge=Math.max(0,...items.map(item=>item.badge?len(` ${item.badge} `):0)),meta=Math.max(0,...items.map(item=>item.meta?len(`  ${item.meta}`):0));
  /* a list with no badge keeps the mockup's rows exactly (its golden frames): the meta already stands at the right edge */
  if(!badge)return null;
  const need=Math.min(24,Math.max(6,...items.map(item=>len(item.label))));const room=lw-4-markW-badge-need;
  return room<0?null:{badge,meta:Math.min(meta,room)};
}
function itemRows(body:ListBody,item:PanelItem,index:number,lw:number,cols:Columns=null):SegRow[]{
  const selected=index===body.sel;
  /* C9 `toggle`: the mockup's [x] of a switch (Automations), `current` is on and the row keeps its colour */
  const mark=body.radio?(item.current?'● ':'○ '):body.toggle?(item.current?'[x] ':'[ ] '):body.check?(item.done?'[x] ':'[ ] '):'';
  const badge=item.badge?` ${item.badge} `:'';const full=item.meta?`  ${item.meta}`:'';
  const badgeW=cols?cols.badge:len(badge),metaW=cols?cols.meta:len(full);const meta=cols&&len(full)>metaW?(metaW>3?trunc(full,metaW):''):full;
  const lab=Math.max(6,lw-4-len(mark)-badgeW-metaW);
  /* FE-048 (01/11, «preciso nel punto esatto»): the voice ends at its last character, the filler keeps its roles and has no action; on two rows it is one element */
  const element=`pitem:${index}`;const labelRole=selected?'acc b':(body.check&&item.done)?'dim':'';const label=trunc(item.label,lab);
  const row:SegRow=[S(selected?' › ':'   ','acc'),{...S(mark,item.current||item.done?'acc':'faint',`pitem:${index}`),element},
    {...S(label,labelRole,`pitem:${index}`),element},S(pad('',lab-len(label)),labelRole),S(badge,item.badgeRoles??['dim','band']),S(pad('',badgeW-len(badge))),S(' '.repeat(Math.max(0,metaW-len(meta)))+meta,'faint')];
  return body.twoLine?[row,[S('     ',item.descRoles??'dim'),{...S(trunc(item.desc??'',lw-6),item.descRoles??'dim',`pitem:${index}`),element}]]:[row];
}

function listBody(body:ListBody,w:number,H:number,wideFrom=100):SegRow[]{
  const items=listItems(body);const sel=Math.max(0,Math.min(body.sel,items.length-1));const b={...body,sel};
  const top=body.top?body.top(w):[];const extra=body.extra?body.extra(w):[];
  const wide=w>=wideFrom&&!!body.detail;const lw=wide?Math.floor(w*(body.split??0.46)):w;
  const head=[...top];
  if((body.filters?.length??0)>(body.oneFilter?0:1))head.push(body.filters!.flatMap((filter,index)=>[S(` ${filter.name} `,index===(body.filterAt??0)?'acc b band':'dim',`pfilter:${index}`),S(' ')]));
  if(body.filtering||body.filter)head.push([S(' / ','acc'),S((body.filter??'')+(body.filtering?'▍':''),'code'),S(t('panel.filterCount',{shown:items.length,total:body.items.length}),'faint')]);
  /* stage 7.19: a detail the mockup's sheet does not have (/tasks) shows only beside the list, never under it */
  const item=items[sel];const det=body.detail&&item&&(wide||!body.wideDetailOnly)?body.detail(item,wide?w-lw-3:w-4):[];
  const detN=wide||!det.length?0:Math.min(det.length+1,Math.floor((H-head.length-extra.length)/2));
  const listH=Math.max(2,H-head.length-extra.length-detN);const per=body.twoLine?2:1;
  const overflow=items.length*per>listH;const capN=Math.max(1,Math.floor((listH-(overflow?1:0))/per));
  const start=Math.max(0,Math.min(items.length-capN,sel-Math.floor(capN/2)));
  const L:SegRow[]=[];
  /* an empty list says why in full: in the list's column it wraps, never cut (s89 found it cut at the split) */
  if(!items.length){const adder=body.emptyAdd===false?undefined:(body.keys??[]).find(key=>key.adds);L.push(...wrap(`${body.filters?.[body.filterAt??0]?.empty??body.empty??t('panel.empty')}${adder?t('panel.emptyAdd',{key:adder.key}):''}`,Math.max(10,lw-3)).map(line=>[S(`  ${line}`,'dim')] as SegRow));}
  /* a heading takes a row of the window: the items shown shrink until they fit, and the chosen one stays */
  const heads=(from:number,count:number)=>items.slice(from,from+count).filter((x,k)=>x.group&&x.group!==items[from+k-1]?.group||(k===0&&x.group)).length;
  let shownN=capN;while(!body.filter&&shownN>1&&shownN*per+heads(start,shownN)+(overflow?1:0)>listH)shownN-=1;
  const first=sel>=start+shownN?sel-shownN+1:start;
  const markW=body.radio||body.toggle||body.check?(body.radio?2:4):0;const cols=listColumns(items,lw,markW);
  items.slice(first,first+(body.filter?capN:shownN)).forEach((x,k)=>{
    if(!body.filter&&x.group&&(k===0||x.group!==items[first+k-1]?.group))L.push([S(` ${x.group}`,'faint')]);
    L.push(...itemRows(b,x,first+k,lw,cols));
  });
  const lastShown=first+(body.filter?capN:shownN);
  if(overflow)L.push([S(`   ${first>0?t('panel.above',{count:first}):''}${lastShown<items.length?t('panel.more',{count:items.length-lastShown}):''}`,'faint')]);
  const out=[...head];
  if(wide){for(let i=0;i<Math.max(L.length,det.length,H-head.length-extra.length);i++)out.push([...fit(L[i]??[S('')],lw),S(' │ ','faint'),...(det[i]??[S('')])]);}
  else{out.push(...L);if(det.length){out.push([S(` ${'─'.repeat(Math.max(0,w-2))}`,'faint')]);out.push(...det.slice(0,detN-1).map(row=>[S('  '),...row]));}}
  out.length=Math.min(out.length,H-extra.length);
  while(out.length<H-extra.length)out.push([S('')]);
  out.push(...extra);return out;
}

function formBody(body:FormBody,w:number):SegRow[]{
  const rows:SegRow[]=[];
  body.fields.forEach((field,i)=>{
    const selected=i===body.sel;let value:SegRow;
    if(field.type==='bool')value=[S(field.value?t('panel.on'):t('panel.off'),field.value?'ok':'dim',`pfopt:${i}:t`)];
    else if(field.type==='choice')value=(field.options??[]).flatMap((option,j)=>[field.off?.includes(option)?S(` ${option} `,'faint'):S(` ${option} `,option===field.value?(selected?'inv':'acc b band'):'dim',`pfopt:${i}:${j}`),S(' ')]);
    else if(field.type==='slider'){const at=(field.options??[]).indexOf(String(field.value));value=(field.options??[]).flatMap((option,j)=>[S(j?' ── ':'',j<=at?'acc':'faint'),S(`${option===field.value?'◆ ':'● '}${option}`,option===field.value?'acc b':j<at?'acc':'faint',`pfopt:${i}:${j}`)]);}
    else{const text=String(field.value);const room=Math.min(48,Math.max(10,w-32));
      value=!text&&field.placeholder?[S(selected?'▍':'','code'),S(pad(trunc(field.placeholder,room-1),room-(selected?1:0)),'faint')]:[S(pad((field.mask?'•'.repeat(len(text)):text)+(selected?'▍':''),room),'code')];}
    rows.push([S(selected?' › ':'   ','acc'),S(pad(field.label,22),selected?'acc b':'',`pfield:${i}`),...value]);
    if(field.help&&selected)rows.push([S(`     ${trunc(field.help,w-6)}`,'dim')]);
  });
  if(body.after)rows.push(...body.after(w));
  if(body.submit){rows.push([S('')]);rows.push([S('   '),S(` ${body.submit} `,'pill','pkey:Enter'),...(body.alt?[S('   '),S(` ${body.alt} `,['dim','band'],'palt')]:[])]);}
  return rows;
}

function progressBody(body:ProgressBody,w:number,now:number):SegRow[]{
  const rows:SegRow[]=[[S('')]];
  for(const step of body.steps){
    const icon=step.state==='run'?SPIN[Math.floor(now/90)%SPIN.length]!:step.state==='ok'?'✓':step.state==='warn'?'!':step.state==='fail'?'✗':'·';
    const roles=step.state==='ok'?'ok':step.state==='warn'?'warn':step.state==='fail'?'err':step.state==='run'?'acc':'faint';
    rows.push([S(`  ${icon} `,roles),S(pad(step.label,26),step.state==='pending'?'faint':''),S(step.detail??'',step.state==='warn'?'warn':'dim')]);
    if(step.fix&&step.state==='warn')rows.push([S(t('panel.fix'),'faint'),S(step.fix,'dim')]);
  }
  if(body.result)rows.push([S('')],...body.result(w));
  return rows;
}

/** One file of a diff as the mockup draws it: its path and what happened to it, then its hunks with their marks' colours. */
export const diffFileRows=(file:DiffFile,rw:number):SegRow[]=>[[S(file.path,'b'),S(`  ${file.note}`,'faint')],...file.hunks.map(line=>[S(pad(line,rw),line.startsWith('@@')?'acc':line.startsWith('+')?'add':line.startsWith('-')?'del':'dim')])];
function diffBody(body:DiffBody,w:number,H:number,wideFrom=100):SegRow[]{
  if(!body.files.length)return[[S(`  ${body.empty??t('panel.empty')}`,'dim')]];
  const wide=w>=wideFrom;const lw=wide?34:w;
  const L=body.files.map((file,i)=>[S(i===body.sel?' › ':'   ','acc'),S(pad(trunc(file.path,lw-15),lw-14),i===body.sel?'acc b':'',`pitem:${i}`),S(`+${file.add}`,'ok'),S(` −${file.del}`,'err')]);
  const file=body.files[body.sel];const rw=wide?w-lw-3:w-2;
  const R:SegRow[]=file?diffFileRows(file,rw):[];
  const off=Math.max(0,Math.min(body.off??0,R.length-1));
  /* the last row says what is left, never text that vanishes with no sign (the mockup's `corpoFile`) */
  if(wide){const out:SegRow[]=[];for(let i=0;i<H;i++)out.push([...fit(L[i]??[S('')],lw),S(' │ ','faint'),...(body.off!==undefined&&i===H-1&&off+H<R.length?[S(t('panel.page.moreBelow',{count:R.length-off-H+1}),'faint')]:R[i+off]??[S('')])]);return out;}
  const head=[...L,[S('─'.repeat(w),'faint')]];
  if(body.off===undefined)return[...head,...R];
  const room=Math.max(1,H-head.length);const cut=off+room<R.length;
  return[...head,...R.slice(off,off+room-(cut?1:0)),...(cut?[[S(t('panel.page.moreBelow',{count:R.length-off-room+1}),'faint')]]:[])];
}

export function renderBody(body:PanelBody,w:number,H:number,now=0,wideFrom=100):SegRow[]{
  if(body.kind==='list')return listBody(body,w,H,wideFrom);
  if(body.kind==='form')return formBody(body,w);
  if(body.kind==='progress')return progressBody(body,w,now);
  if(body.kind==='diff')return diffBody(body,w,H,wideFrom);
  return body.lines(w,H,now);
}

/** The row of keys (the mockup's `hintRow`): each key in the accent, its name faint, both a click on the key. */
export function hintRow(panel:Panel):SegRow{
  const body=panel.tabs[panel.tab]!.body;const segs:SegRow=[S(' ')];
  const add=(key:string,label:string,action:string)=>{segs.push(S(key,'acc',action),S(` ${label}   `,'faint',action));};
  if(panel.edit){add('enter',t('panel.key.save'),'pkey:Enter');add('esc',t('panel.key.cancel'),'pkey:Escape');return segs;}
  if(panel.confirmDel!=null){segs.push(S(panel.confirmWords??t('panel.confirmDelete'),'warn'));return segs;}
  if(body.kind==='list'&&body.filtering){add('enter',t('panel.key.done'),'pkey:Enter');add('esc',t('panel.key.clear'),'pkey:Escape');return segs;}
  if(body.kind==='list'||body.kind==='diff'){
    add('↑/↓',t('panel.key.move'),'');
    /* C9 frames (01/11): an empty list offers only what adds; a key that needs a row is not offered where there is none */
    const none=body.kind==='list'&&!listItems(body).length&&!body.filter;
    if(body.kind==='list'&&body.enter&&!none)add('enter',body.enter,'pkey:Enter');
    const under=body.kind==='list'?listItems(body)[body.sel]:undefined;
    for(const key of body.keys??[])if(!key.hidden&&(!none||key.adds)&&(!key.forItem||(under&&key.forItem(under))))add(key.key,key.label,`pkey:${key.key==='space'?' ':key.key}`);
    if(body.kind==='list'&&body.lr)add('←/→',body.lrLabel??t('panel.key.adjust'),'');
    if(body.kind==='list'&&body.filterable)add('/',t('panel.key.search'),'pkey:/');
    /* C11c: on a page with tabs, Tab is the tab's, so `[ ]` says the filters, where the mockup says it (index.html:469, 472) */
    if(body.kind==='list'&&panel.page&&panel.tabs.length>1&&(body.filters?.length??0)>1)add('[ ]',t('panel.key.filter'),'pkey:]');
  }else if(body.kind==='form'){
    /* a form of no fields (the setup's «no key needed») has only its button */
    if(body.fields.length){add('↑/↓',t('panel.key.field'),'');add('space ←/→',t('panel.key.change'),'');}
    if(body.submit)add('enter',body.submit.toLowerCase(),'pkey:Enter');
    if(body.alt)add('ctrl+c',body.alt.toLowerCase(),'palt');
    for(const key of body.keys??[])if(!key.hidden)add(key.key,key.label,`pkey:${key.key}`);
  }else{if(panel.page&&body.kind==='info'&&!body.fixed)add('↑/↓',t('panel.key.move'),'');for(const key of body.keys??[])if(!key.hidden)add(key.key,key.label,`pkey:${key.key}`);}
  if(panel.tabs.length>1)add('tab',t('panel.key.nextTab'),'pkey:Tab');
  else if(body.kind==='list'&&(body.filters?.length??0)>1&&!body.filtering)add('tab',t('panel.key.nextFilter'),'pkey:Tab');
  add('esc',t('panel.key.close'),'pkey:Escape');
  return segs;
}

/** The sheet's rows at `w` columns in `H` rows (the mockup's `panelRows`). */
export function panelRows(panel:Panel,w:number,H:number,now=0):SegRow[]{
  const body=panel.tabs[panel.tab]!.body;const rows:SegRow[]=[];
  const title=` ${panel.title} `,sub=panel.sub?`${panel.sub} `:'';
  rows.push([S('──','acc'),S(title,'acc b'),S(sub,'dim'),S('─'.repeat(Math.max(0,w-4-len(title)-len(sub))),'acc'),S(' ✕','faint','pkey:Escape')]);
  if(panel.tabs.length>1)rows.push([S(' '),...panel.tabs.flatMap((tab,i)=>[S(` ${tab.name} `,i===panel.tab?'inv':'dim',`ptab:${i}`),S(' ')])]);
  const hints=hintRows(panel,w);
  const bodyH=H-rows.length-1-hints.length;const shown=renderBody(body,w,bodyH,now);
  for(let i=0;i<bodyH;i++)rows.push(shown[i]??[S('')]);
  const edit=panel.edit;
  rows.push(edit?[S(` ${edit.label} `,'acc b'),S(pad((edit.mask?'•'.repeat(len(edit.value)):edit.value)+'▍',Math.max(10,w-len(edit.label)-4)),'code')]:[S('')]);
  rows.push(...hints);
  return rows;
}

/** Owner 03/10: the row of keys on two rows only when one does not fit (a narrow screen, a sheet with a key more than the
 *  mockup's), split between keys; a row that fits is the mockup's, unchanged. */
export function hintRows(panel:Panel,w:number):SegRow[]{
  const row=hintRow(panel);const width=(segs:SegRow)=>len(segs.map(segment=>segment.text).join('').trimEnd());
  if(width(row)<=w)return[row];
  const first:SegRow=[S(' ')],second:SegRow=[S(' ')];let target=first;
  for(let i=1;i<row.length;i+=2){
    const pair=row.slice(i,i+2);
    if(target===first&&first.length>1&&width([...first,...pair])>w)target=second;
    target.push(...pair);
  }
  return[first,second];
}

/** How tall the sheet is (the mockup's `panelHeight`): what its content needs, at least 10 rows, at most the cap that keeps
 *  the conversation above visible (a short terminal gives it all but two rows). */
export function panelHeight(panel:Panel,w:number,h:number,footRows:number,activityRows:number,now=0):number{
  const avail=h-1-footRows-activityRows;const max=h<=24?avail-2:Math.min(avail-8,28);
  const chrome=2+hintRows(panel,w).length+(panel.tabs.length>1?1:0);const body=renderBody(panel.tabs[panel.tab]!.body,w,max-chrome,now);
  let n=body.length;while(n>0&&/^[\s│]*$/u.test(body[n-1]!.map(segment=>segment.text).join('')))n--;
  return Math.min(max,Math.max(10,n+chrome+1));
}

/*
 * The keys and clicks of a sheet (the mockup's `panelKey` and `panelClick`), as a pure step: the sheet after the key, and
 * the EFFECT the command behind it carries out (choose an item, save an edit, delete after «d» again, submit a form, change
 * a field…). The sheet never acts by itself: each command's adapter turns effects into what TALOS does. Keys are named as
 * the mockup names them: `Enter`, `Escape`, `Tab`, `Backspace`, `ArrowUp/Down/Left/Right`, `PageUp/Down`, or the character.
 */
export type SheetKey={name:string;ctrl?:boolean;shift?:boolean};
export type PanelEffect=
  |{kind:'none'}|{kind:'close'}|{kind:'tab';tab:number}
  |{kind:'enter';index:number;item:PanelItem}
  |{kind:'key';key:string;index:number|null;item:PanelItem|null}
  |{kind:'edited';value:string}|{kind:'delete';index:number;item:PanelItem}
  |{kind:'submit'}|{kind:'alt'}|{kind:'change';field:number;value:string|boolean}|{kind:'lr';delta:-1|1};
export type PanelStep={panel:Panel;effect:PanelEffect};
const NONE:PanelEffect={kind:'none'};
const withBody=(panel:Panel,body:PanelBody):Panel=>({...panel,tabs:panel.tabs.map((tab,i)=>i===panel.tab?{...tab,body}:tab)});
const single=(name:string)=>[...name].length===1;
function switchTab(panel:Panel,delta:number):PanelStep{const tab=(panel.tab+delta+panel.tabs.length)%panel.tabs.length;return{panel:{...panel,tab},effect:{kind:'tab',tab}};}
/** The adapter asks «d again to delete» for the selected item (the mockup's crud `d`). */
export const askDelete=(panel:Panel):Panel=>{const body=panel.tabs[panel.tab]!.body;return{...panel,confirmDel:body.kind==='list'||body.kind==='diff'?body.sel:null};};
/** The adapter opens the edit row (rename, new, set key…); its Enter is the `edited` effect. */
export const startEdit=(panel:Panel,label:string,value='',mask=false):Panel=>({...panel,edit:{label,value,...(mask?{mask}:{})}});

export function panelKey(panel:Panel,key:SheetKey):PanelStep{
  const k=key.name;const body=panel.tabs[panel.tab]!.body;
  if(panel.edit){
    const edit=panel.edit;
    if(k==='Enter')return{panel:{...panel,edit:null},effect:{kind:'edited',value:edit.value}};
    if(k==='Escape')return{panel:{...panel,edit:null},effect:NONE};
    if(k==='Backspace')return{panel:{...panel,edit:{...edit,value:[...edit.value].slice(0,-1).join('')}},effect:NONE};
    if(single(k)&&!key.ctrl)return{panel:{...panel,edit:{...edit,value:edit.value+k}},effect:NONE};
    return{panel,effect:NONE};
  }
  if(body.kind==='list'&&body.filtering){
    if(k==='Enter'||k==='Escape')return{panel:withBody(panel,{...body,filtering:false,...(k==='Escape'?{filter:''}:{})}),effect:NONE};
    if(k==='Backspace')return{panel:withBody(panel,{...body,filter:[...(body.filter??'')].slice(0,-1).join('')}),effect:NONE};
    if(k==='ArrowDown')return{panel:withBody(panel,{...body,sel:body.sel+1}),effect:NONE};
    if(k==='ArrowUp')return{panel:withBody(panel,{...body,sel:Math.max(0,body.sel-1)}),effect:NONE};
    if(single(k)&&!key.ctrl)return{panel:withBody(panel,{...body,filter:(body.filter??'')+k,sel:0}),effect:NONE};
    return{panel,effect:NONE};
  }
  if(panel.confirmDel!=null){
    const index=panel.confirmDel;const cleared={...panel,confirmDel:null};
    const items=body.kind==='list'?listItems(body):[];const item=items[index];
    return{panel:cleared,effect:k==='d'&&item?{kind:'delete',index,item}:NONE};
  }
  if(k==='Escape'){if(body.kind==='list'&&body.filter)return{panel:withBody(panel,{...body,filter:''}),effect:NONE};return{panel,effect:{kind:'close'}};}
  if(panel.page&&k==='?')return{panel:{...panel,moreKeys:!panel.moreKeys},effect:NONE};
  if(panel.page&&(k==='['||k===']')&&body.kind==='list'&&(body.filters?.length??0)>1){
    const count=body.filters!.length;
    return{panel:withBody(panel,{...body,filterAt:((body.filterAt??0)+(k===']'?1:count-1))%count,sel:0}),effect:NONE};
  }
  if(panel.page&&body.kind==='info'&&!body.fixed&&(k==='ArrowDown'||k==='ArrowUp'||k==='PageDown'||k==='PageUp')){
    const step=k==='PageDown'?8:k==='PageUp'?-8:k==='ArrowDown'?1:-1;
    return{panel:withBody(panel,{...body,off:Math.max(0,(body.off??0)+step)}),effect:NONE};
  }
  if(panel.page&&body.kind==='diff'&&(k==='PageDown'||k==='PageUp'))return{panel:withBody(panel,{...body,off:Math.max(0,(body.off??0)+(k==='PageDown'?8:-8))}),effect:NONE};
  if(k==='Tab'&&panel.tabs.length>1)return switchTab(panel,key.shift?-1:1);
  if(k==='Tab'&&body.kind==='list'&&(body.filters?.length??0)>1){const count=body.filters!.length;return{panel:withBody(panel,{...body,filterAt:((body.filterAt??0)+(key.shift?count-1:1))%count,sel:0}),effect:NONE};}
  if(body.kind==='list'||body.kind==='diff'){
    const count=body.kind==='diff'?body.files.length:listItems(body).length;
    const move=(sel:number)=>({panel:withBody(panel,{...body,sel,...(body.kind==='diff'&&panel.page?{off:0}:{})}),effect:NONE});
    if(k==='ArrowDown')return move(Math.min(count-1,body.sel+1));
    if(k==='ArrowUp')return move(Math.max(0,body.sel-1));
    if(k==='PageDown')return move(Math.min(count-1,body.sel+8));
    if(k==='PageUp')return move(Math.max(0,body.sel-8));
    if(k==='ArrowLeft'||k==='ArrowRight'){
      const delta=k==='ArrowRight'?1:-1;
      if(body.kind==='list'&&body.lr)return{panel,effect:{kind:'lr',delta}};
      return panel.tabs.length>1?switchTab(panel,delta):{panel,effect:NONE};
    }
    if(body.kind==='list'){
      if(k==='/'&&body.filterable)return{panel:withBody(panel,{...body,filtering:true,filter:''}),effect:NONE};
      const item=listItems(body)[body.sel]??null;
      if(k==='Enter'&&body.enter&&item)return{panel,effect:{kind:'enter',index:body.sel,item}};
      const bound=(body.keys??[]).find(entry=>entry.key===k||(entry.key==='space'&&k===' '));
      if(bound&&(item||bound.adds))return{panel,effect:{kind:'key',key:bound.key,index:item?body.sel:null,item}};
      return{panel,effect:NONE};
    }
    const bound=(body.keys??[]).find(entry=>entry.key===k);
    return{panel,effect:bound?{kind:'key',key:bound.key,index:body.sel,item:null}:NONE};
  }
  if(body.kind==='form'){
    const count=body.fields.length;const field=body.fields[body.sel];
    /* a form of no fields (the setup's «no key needed»): only its button */
    if(!count&&(k==='ArrowDown'||k==='ArrowUp'))return{panel,effect:NONE};
    if(k==='ArrowDown')return{panel:withBody(panel,{...body,sel:(body.sel+1)%count}),effect:NONE};
    if(k==='ArrowUp')return{panel:withBody(panel,{...body,sel:(body.sel-1+count)%count}),effect:NONE};
    if(key.ctrl&&(k==='c'||k==='C')&&body.alt)return{panel,effect:{kind:'alt'}};
    if(k==='Enter'&&body.submit)return{panel,effect:{kind:'submit'}};
    const set=(value:string|boolean):PanelStep=>({panel:withBody(panel,{...body,fields:body.fields.map((f,i)=>i===body.sel?{...f,value}:f)}),effect:{kind:'change',field:body.sel,value}});
    if(field){
      if(field.type==='text'){if(k==='Backspace')return set([...String(field.value)].slice(0,-1).join(''));if(single(k)&&!key.ctrl)return set(String(field.value)+k);}
      if(k===' '&&field.type==='bool')return set(!field.value);
      if((k==='ArrowLeft'||k==='ArrowRight'||k===' ')&&(field.type==='choice'||field.type==='slider')){
        const options=(field.options??[]).filter(option=>!field.off?.includes(option));const d=k==='ArrowLeft'?-1:1;const at=options.indexOf(String(field.value));
        return set(field.type==='slider'?options[Math.max(0,Math.min(options.length-1,at+d))]!:options[(at+d+options.length)%options.length]!);
      }
    }
    if((k==='ArrowLeft'||k==='ArrowRight')&&panel.tabs.length>1)return switchTab(panel,k==='ArrowRight'?1:-1);
    const own=field?.type==='text'?undefined:(body.keys??[]).find(entry=>entry.key===k);
    return{panel,effect:own?{kind:'key',key:own.key,index:null,item:null}:NONE};
  }
  if((k==='ArrowLeft'||k==='ArrowRight')&&panel.tabs.length>1&&!(body.kind==='info'&&body.fixed))return switchTab(panel,k==='ArrowRight'?1:-1);
  const bound=(body.keys??[]).find(entry=>entry.key===k);
  return{panel,effect:bound?{kind:'key',key:bound.key,index:null,item:null}:NONE};
}

/** A click on one of the sheet's targets (the mockup's `panelClick`): the key it names, a tab, an item (a second click on
 *  the selected one is its Enter), a field, one of a field's options, or the form's other button. */
export function panelClick(panel:Panel,action:string):PanelStep{
  const at=action.indexOf(':');const verb=at<0?action:action.slice(0,at);const arg=at<0?'':action.slice(at+1);
  const body=panel.tabs[panel.tab]!.body;
  if(verb==='pkey')return panelKey(panel,{name:arg});
  if(verb==='ptab'){const tab=Number(arg);return tab>=0&&tab<panel.tabs.length?{panel:{...panel,tab},effect:{kind:'tab',tab}}:{panel,effect:NONE};}
  if(verb==='pfilter'&&body.kind==='list')return{panel:withBody(panel,{...body,filterAt:Number(arg),sel:0}),effect:NONE};
  if(verb==='pitem'&&(body.kind==='list'||body.kind==='diff')){
    const index=Number(arg);
    if(body.kind==='list'&&body.sel===index&&body.enter)return panelKey(panel,{name:'Enter'});
    return{panel:withBody(panel,{...body,sel:index}),effect:NONE};
  }
  if(body.kind!=='form')return{panel,effect:NONE};
  if(verb==='pfield')return{panel:withBody(panel,{...body,sel:Number(arg)}),effect:NONE};
  if(verb==='pfopt'){
    const [i,j]=arg.split(':');const index=Number(i);const field=body.fields[index];if(!field)return{panel,effect:NONE};
    const value=j==='t'?!field.value:(field.options??[])[Number(j)];if(value===undefined)return{panel,effect:NONE};
    return{panel:withBody(panel,{...body,sel:index,fields:body.fields.map((f,k)=>k===index?{...f,value}:f)}),effect:{kind:'change',field:index,value}};
  }
  if(verb==='palt'&&body.alt)return{panel,effect:{kind:'alt'}};
  return{panel,effect:NONE};
}
