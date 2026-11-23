import type {NestedRepository} from '../security/workspace-identity.ts';
import type {ProjectTrustAssessment} from '../security/project-trust-gate.ts';
import {t,tn} from '../i18n/index.ts';
import {createTerminalSizeStore,frameRowsFor,terminalFrameProps} from './components/terminal-shell.ts';
import {detectTerminalCapabilities} from './terminal-capabilities.ts';
import {createTerminalSessionPlan} from './terminal-session.ts';
import {displayWidth,truncateDisplay,truncateMiddle,wrapDisplay} from './text-width.ts';
import {liveTheme} from './theme-store.ts';
import {DEFAULT_THEME_ACCENT} from './theme-catalog.ts';
import {preloadProductionReact} from './react-runtime.ts';
import {roleStyle} from './components/styled-rows.ts';
import type {UiTheme} from '../config/types.ts';

/*
 * R4 (owner decisions Q-R4-1…3, gate E1/E4): the trust question.
 * - Asked before anything is loaded (main.ts), for every folder with no saved decision.
 * - 02/11: Yes · Yes, and the parent (<parent>) · Only this time · No, No highlighted (Claude Code focuses "No, exit";
 *   Gemini offers the parent; Codex lets an untrusted folder work with more questions, which is our No). The parent is offered
 *   only when it may be saved; the home folder and a drive root offer Only this time and No.
 * - Keys pressed in the first PROJECT_TRUST_GRACE_MS after the question appears are ignored, like approvals (Q-R3-16): a
 *   key typed ahead of the question never answers it.
 * - Drawn in the alternate screen with the TUI's frame and colours, so nothing is left in the terminal (Q-R4-3), and laid
 *   out to the terminal's rows (R1 height budget): what does not fit is counted, the title and the choices always show.
 */
/* Owner 01/11 night, decision 2, and 02/11 (Frontend's words, «No (a)»): Yes · [Yes, and the parent] · Only this time · No, No
   by default. `once` trusts for this process and writes nothing; `no` opens TALOS without the folder's instructions, hooks and
   tools, every change and command asked (main.ts). `cancel` is only Ctrl+C: it quits, as before. */
export type ProjectTrustPromptChoice='cancel'|'trust'|'trust-parent'|'once'|'no';
/* R5b D4: `theme` is the user's configured theme (main.ts reads the user scope only, before trust). */
/* P17: `setupStep` — the first launch's question is step 1 of the guided setup, and says so. */
export type ProjectTrustPromptInput={assessment:ProjectTrustAssessment;nestedRepositories:readonly NestedRepository[];color?:boolean;theme?:UiTheme;setupStep?:boolean};
export type ProjectTrustChoiceRow={id:ProjectTrustPromptChoice;label:string;shortcut:string;hint?:string};
export type ProjectTrustPromptModel={
  title:string;
  setupStep?:boolean;
  project:string;
  reason:string;
  resourceSummary:string;
  resources:string[];
  nestedRepositories:string[];
  session:string|null;
  choices:ProjectTrustChoiceRow[];
  parent:string|null;
  defaultSelection:ProjectTrustPromptChoice;
};
/* Judge v2242 (19/11, mockup index.html:1613 «Si attiva tra un attimo»): one second, said in the keys row, instead of 300 ms
   unsaid. No key answers or moves the card meanwhile (the gate in the key handler); after it everything is as before. */
export const PROJECT_TRUST_GRACE_MS=1000;

/* E4: paths are shown as the person types them. Control, C1, line/paragraph separators, bidi controls and
   default-ignorable characters are shown as `\uXXXX`; a backslash is doubled only where it would read as such an escape
   (a folder named `u0041`), so every escape on screen is unambiguous and every other backslash is single. */
const TERMINAL_UNSAFE=/[\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
const ESCAPE_LOOKALIKE=/\\(?=u(?:[0-9a-fA-F]{4}|\{[0-9a-fA-F]+\}))/gu;
const BACKSLASH=String.fromCharCode(92);

export function inertProjectTrustText(value:string):string{
  return value.replace(ESCAPE_LOOKALIKE,()=>BACKSLASH+BACKSLASH).replace(TERMINAL_UNSAFE,character=>{
    const code=character.codePointAt(0)!;
    return code>0xffff?`${BACKSLASH}u{${code.toString(16)}}`:`${BACKSLASH}u${code.toString(16).padStart(4,'0')}`;
  });
}

function reasonText(assessment:ProjectTrustAssessment):string{
  if(assessment.reason==='PROJECT_UNTRUSTED')return t('firstrun.trust.reason.untrusted');
  if(assessment.trusted)return t('firstrun.trust.plain');
  if(assessment.reason==='RESOURCE_FINGERPRINT_CHANGED')return t('firstrun.trust.reason.fingerprint');
  if(assessment.reason==='RESOURCE_SCRIPTS_NOW_PINNED')return t('firstrun.trust.reason.scripts');
  if(assessment.reason==='RESOURCE_SET_CHANGED')return t('firstrun.trust.reason.set');
  if(assessment.reason==='RESOURCE_IDENTITY_MISMATCH')return t('firstrun.trust.reason.identity');
  if(assessment.reason==='NESTED_REPOSITORY_BOUNDARY_CHANGED')return t('firstrun.trust.reason.nested');
  return t('firstrun.trust.reason.other',{reason:assessment.reason});
}
/* E4: each resource once — `kind · path`, and `kind · id · path` only when the id is not the path (an MCP server or a
   hook named inside a shared config file: the trust center lists them the same way). */
function resourceLine(resource:ProjectTrustAssessment['resources'][number]):string{
  const where=inertProjectTrustText(resource.relativePath);
  return resource.id===resource.relativePath?`${resource.kind} · ${where}`:`${resource.kind} · ${inertProjectTrustText(resource.id)} · ${where}`;
}

export function projectTrustPromptModel({assessment,nestedRepositories,setupStep}:ProjectTrustPromptInput):ProjectTrustPromptModel{
  const counts=new Map<string,number>();
  for(const resource of assessment.resources)counts.set(resource.kind,(counts.get(resource.kind)??0)+1);
  const detail=[...counts.entries()].sort(([left],[right])=>left.localeCompare(right)).map(([kind,count])=>`${kind} ${count}`).join(', ');
  const folder=assessment.folder;
  const sessionOnly=folder?.sessionOnly===true;
  /* The parent is offered for a folder being decided for the first time, and only when it may be saved. */
  const parent=!sessionOnly&&folder&&!folder.decided&&folder.parent?inertProjectTrustText(folder.parent):null;
  /* The home folder and a drive root are never saved: there «Yes» would be «Only this time», so only that and No are offered.
     The parent stays as the second Yes (owner 02/11: «Resta come quarta riga»), offered only when it may be saved. */
  const choices:ProjectTrustChoiceRow[]=[
    ...(sessionOnly?[]:[{id:'trust' as const,label:t('firstrun.trust.choice.trust'),shortcut:'y'}]),
    ...(parent?[{id:'trust-parent' as const,label:t('firstrun.trust.choice.parent',{path:parent}),shortcut:'p'}]:[]),
    {id:'once',label:t('firstrun.trust.choice.once'),shortcut:'o',hint:t('firstrun.trust.choice.onceHint')},
    {id:'no',label:t('firstrun.trust.choice.no'),shortcut:'n',hint:t('firstrun.trust.choice.noHint')},
  ];
  const firstTime=assessment.trusted||assessment.reason==='PROJECT_UNTRUSTED';
  return{
    title:t(firstTime?'firstrun.trust.title':'firstrun.trust.titleChanged'),
    ...(setupStep?{setupStep:true}:{}),
    project:inertProjectTrustText(assessment.workspace.canonicalRoot),
    reason:reasonText(assessment),
    resourceSummary:assessment.resources.length?tn('firstrun.trust.files',assessment.resources.length,{detail}):'',
    resources:assessment.resources.map(resourceLine),
    nestedRepositories:nestedRepositories.map(entry=>inertProjectTrustText(entry.relativePath)),
    session:sessionOnly?t('firstrun.trust.session'):null,
    choices,
    parent,
    defaultSelection:'no', /* Enter alone never trusts a folder (Frontend condition 3) */
  };
}

/** Moves the highlight; Tab wraps around, the arrows stop at the ends. Two choices when `choices` is omitted (pre-R4). */
export function nextProjectTrustSelection(current:ProjectTrustPromptChoice,direction:'previous'|'next'|'toggle',choices:readonly ProjectTrustPromptChoice[]=['trust','once','no']):ProjectTrustPromptChoice{
  const index=Math.max(0,choices.indexOf(current));
  if(direction==='toggle')return choices[(index+1)%choices.length]!;
  return choices[Math.min(choices.length-1,Math.max(0,index+(direction==='next'?1:-1)))]!;
}

export type ProjectTrustPromptRow={kind:'title'|'path'|'text'|'dim'|'warning'|'blank'|'choice'|'keys';text:string;selected?:boolean};

/* Word wrap by display width; a word longer than the row is broken inside. */
function wrapWords(text:string,width:number):string[]{
  const limit=Math.max(1,width);const rows:string[]=[];let row='';
  for(const word of text.split(/ +/u).filter(Boolean)){
    const candidate=row?`${row} ${word}`:word;
    if(displayWidth(candidate)<=limit){row=candidate;continue;}
    if(row)rows.push(row);
    if(displayWidth(word)<=limit){row=word;continue;}
    const pieces=wrapDisplay(word,limit);row=pieces.pop()!;rows.push(...pieces);
  }
  if(row||!rows.length)rows.push(row);
  return rows;
}
/* A long value squeezed into one row: cut with an ellipsis. */
function oneRow(rows:string[],width:number):string[]{return rows.length<=1?rows:[truncateDisplay(rows.join(' '),width)];}

/**
 * The question's rows for a terminal of `columns`×`rows` (inside a round border with one column of padding, in a frame of
 * the R1 height). What does not fit is given up in this order: the blank row, the keys row, nested repositories (counted);
 * then the folder path, the summary and the reason shrink to one row each; then listed files go one by one (counted
 * instead) and the session line shrinks; at last the rest goes. The title and every choice always show, and the files a
 * folder holds are named for as long as there is room (measured at 40×12: the list went first and the one file was lost).
 */
export function layoutProjectTrustPrompt(model:ProjectTrustPromptModel,{columns,rows,selected,unicode=true,arming=false,platform=process.platform}:{columns:number;rows:number;selected:ProjectTrustPromptChoice;unicode?:boolean;/* the first PROJECT_TRUST_GRACE_MS: the keys row says the card turns on in a moment */arming?:boolean;platform?:string}):ProjectTrustPromptRow[]{
  const width=Math.max(1,Math.floor(columns)-4);
  const budget=Math.max(1,frameRowsFor(rows,platform)-2);
  /* FE-060 frame review: the chosen row carries `›` as in the approved mockup (bozzetto-cli-retro/index.html:1573) and every
     other CLI list; `>` only where the terminal has no Unicode, with the classic border. */
  const marker=unicode?'›':'>';
  const choiceRows=model.choices.map(choice=>{
    let label=choice.label;
    if(choice.id==='trust-parent'&&model.parent&&displayWidth(label)>width-2){
      const room=Math.max(4,width-2-displayWidth(t('firstrun.trust.choice.parent',{path:''})));
      label=t('firstrun.trust.choice.parent',{path:truncateMiddle(model.parent,room)});
    }
    return{kind:'choice' as const,text:truncateDisplay(`${choice.id===selected?marker:' '} ${label}`,width),selected:choice.id===selected,hint:choice.hint?truncateDisplay(`    ${choice.hint}`,width):null};
  });
  const hintCount=choiceRows.filter(row=>row.hint).length;
  const title=truncateDisplay(t(model.setupStep?'firstrun.setup.trustHeading':'firstrun.trust.heading',{title:model.title}),width);
  let path=wrapDisplay(model.project,width);
  let reason=wrapWords(model.reason,width);
  let summary=model.resourceSummary?wrapWords(model.resourceSummary,width):[];
  let session=model.session?wrapWords(model.session,width):[];
  let shown=Math.min(model.resources.length,8);
  let nestedList=model.nestedRepositories.length>0;
  let nestedCount=false;
  let blank=true;let keys=true;let hints=true;
  const more=()=>shown<model.resources.length&&shown>0?1:0;
  const nestedRows=()=>nestedList?1+model.nestedRepositories.length:nestedCount?1:0;
  const total=()=>1+path.length+reason.length+summary.length+shown+more()+nestedRows()+session.length+(blank?1:0)+choiceRows.length+(hints?hintCount:0)+(keys?1:0);
  /* Each step gives up one thing and says whether it could. */
  const steps:Array<()=>boolean>=[
    ()=>{if(!blank)return false;blank=false;return true;},
    ()=>{if(!keys)return false;keys=false;return true;},
    /* the words under Only this time and No go before any fact about the folder */
    ()=>{if(!hints)return false;hints=false;return true;},
    ()=>{if(!nestedList)return false;nestedList=false;nestedCount=true;return true;},
    ()=>{if(path.length<=1)return false;path=[truncateMiddle(model.project,width)];return true;},
    ()=>{if(summary.length<=1)return false;summary=oneRow(summary,width);return true;},
    ()=>{if(reason.length<=1)return false;reason=oneRow(reason,width);return true;},
    ()=>{if(shown===0)return false;shown-=1;return true;},
    ()=>{if(session.length<=1)return false;session=oneRow(session,width);return true;},
    ()=>{if(!nestedCount)return false;nestedCount=false;return true;},
    ()=>{if(!summary.length)return false;summary=[];return true;},
    ()=>{if(!reason.length)return false;reason=[];return true;},
    ()=>{if(!session.length)return false;session=[];return true;},
    ()=>{if(!path.length)return false;path=[];return true;},
  ];
  for(const step of steps){while(total()>budget&&step()){/* keep giving up this part */}if(total()<=budget)break;}
  const out:ProjectTrustPromptRow[]=[{kind:'title',text:title}];
  for(const row of path)out.push({kind:'path',text:row});
  for(const row of reason)out.push({kind:'text',text:row});
  for(const row of summary)out.push({kind:'dim',text:row});
  for(const resource of model.resources.slice(0,shown))out.push({kind:'dim',text:truncateMiddle(`  - ${resource}`,width)});
  if(more())out.push({kind:'dim',text:truncateDisplay(`  - ${t('firstrun.trust.more',{count:model.resources.length-shown})}`,width)});
  if(nestedList){
    out.push({kind:'warning',text:truncateDisplay(t('firstrun.trust.nested'),width)});
    for(const nested of model.nestedRepositories)out.push({kind:'text',text:truncateMiddle(`  - ${nested}`,width)});
  }else if(nestedCount)out.push({kind:'warning',text:truncateDisplay(tn('firstrun.trust.nestedCount',model.nestedRepositories.length),width)});
  for(const row of session)out.push({kind:'warning',text:row});
  if(blank)out.push({kind:'blank',text:''});
  for(const row of choiceRows){out.push({kind:row.kind,text:row.text,selected:row.selected});if(hints&&row.hint)out.push({kind:'dim',text:row.hint});}
  if(keys)out.push({kind:'keys',text:truncateDisplay(t(arming?'firstrun.trust.arming':'firstrun.trust.keys'),width)});
  return out;
}

/**
 * Judge v2242 (19/11), mockup `index.html:1613`: the title sits in the top border, `╭─ ` then the title on a band, then the
 * border runs on to its corner. Exactly `columns` wide; a narrow terminal cuts the title, never the border. ASCII where the
 * terminal has no Unicode (the classic border, `+-`).
 */
export function projectTrustTopBorder(title:string,columns:number,unicode=true):{lead:string;band:string;tail:string}{
  const [corner,line,end]=unicode?['╭','─','╮']:['+','-','+'];
  const total=Math.max(4,Math.floor(columns));
  const lead=`${corner}${line} `;
  const room=total-displayWidth(lead)-1-2; /* the end corner, and one space either side of the title */
  const band=room>=1?` ${truncateDisplay(title,room)} `:'';
  return{lead,band,tail:line.repeat(Math.max(0,total-displayWidth(lead)-displayWidth(band)-1))+end};
}

export type ProjectTrustPromptIo={stdin?:any;stdout?:any;env?:Record<string,string|undefined>;clock?:()=>number};

export async function runProjectTrustPrompt(input:ProjectTrustPromptInput,io:ProjectTrustPromptIo={}):Promise<ProjectTrustPromptChoice>{
  const stdin=io.stdin??process.stdin;const stdout=io.stdout??process.stdout;const env=io.env??process.env;const clock=io.clock??Date.now;
  if(!stdin.isTTY||!stdout.isTTY)return'cancel';
  let React:any,Ink:any;
  try{preloadProductionReact();React=(await import('react')).default;/* React's own object, as the bundle provides it (run.ts loadTuiModules) */Ink=await import('ink');}catch{throw new Error('TUI_DEPENDENCY_UNAVAILABLE');}
  const capabilities=detectTerminalCapabilities({stdinIsTTY:true,stdoutIsTTY:true,color:input.color!==false,env});
  const session=createTerminalSessionPlan({capabilities,env});
  const theme=liveTheme(capabilities,input.theme??DEFAULT_THEME_ACCENT).theme;
  const model=projectTrustPromptModel(input);
  const ids=model.choices.map(choice=>choice.id);
  const sizeStore=createTerminalSizeStore(stdout,{rows:24,columns:80});
  let settled=false;
  let settle:(choice:ProjectTrustPromptChoice)=>void=()=>{};
  const choicePromise=new Promise<ProjectTrustPromptChoice>(resolve=>{settle=choice=>{if(settled)return;settled=true;resolve(choice);};});
  /* The grace runs from when the question is drawn: set now, and again when the first frame is committed. */
  const opened={at:clock()};

  function Prompt(){
    const size=React.useSyncExternalStore(sizeStore.subscribe,sizeStore.getSnapshot,sizeStore.getSnapshot);
    const [selected,setSelected]=React.useState(model.defaultSelection);
    /* Read by the key handler synchronously: Ink's input handler may close over an older render. */
    const selectedRef=React.useRef(model.defaultSelection);
    const {exit}=Ink.useApp();
    /* the keys row says «turns on in a moment» until the grace is over (judge v2242); the key gate below stays the clock's */
    const [arming,setArming]=React.useState(true);
    React.useEffect(()=>{opened.at=clock();const timer=setTimeout(()=>setArming(false),PROJECT_TRUST_GRACE_MS);return()=>clearTimeout(timer);},[]);
    const choose=(choice:ProjectTrustPromptChoice)=>{selectedRef.current=choice;setSelected(choice);};
    const finish=(choice:ProjectTrustPromptChoice)=>{settle(choice);exit();};
    Ink.useInput((value:string,key:any)=>{
      if(clock()-opened.at<PROJECT_TRUST_GRACE_MS)return;
      const lower=typeof value==='string'?value.toLowerCase():'';
      if(key.ctrl&&lower==='c'){finish('cancel');return;}
      if(key.escape){finish('no');return;} /* Esc is the safe answer, No: TALOS opens without the folder's instructions */
      if(key.return){finish(selectedRef.current);return;}
      if(key.upArrow||key.leftArrow||(key.tab&&key.shift)){choose(nextProjectTrustSelection(selectedRef.current,'previous',ids));return;}
      if(key.downArrow||key.rightArrow){choose(nextProjectTrustSelection(selectedRef.current,'next',ids));return;}
      if(key.tab){choose(nextProjectTrustSelection(selectedRef.current,'toggle',ids));return;}
      if(key.ctrl||key.meta)return;
      const shortcut=model.choices.find(choice=>choice.shortcut===lower);
      if(shortcut)choose(shortcut.id);
    });
    const [head,...body]=layoutProjectTrustPrompt(model,{columns:size.columns,rows:size.rows,selected,unicode:capabilities.unicode,arming});
    /* Judge v2242, mockup index.html:1613: the folder is drawn as code, padded to the row (`pad(…,'code')`) */
    const inner=Math.max(1,Math.floor(size.columns)-4);
    const style=(row:ProjectTrustPromptRow)=>row.kind==='path'?roleStyle(['code'],theme.colors)
      :row.kind==='choice'?(row.selected?{bold:true,color:theme.colors.accent}:{})
      :row.kind==='warning'?{color:theme.colors.warning}
      :row.kind==='dim'||row.kind==='keys'?{dimColor:true}:{};
    const text=(row:ProjectTrustPromptRow)=>row.kind==='path'?row.text+' '.repeat(Math.max(0,inner-displayWidth(row.text))):row.text||' ';
    const children=body.map((row,index)=>React.createElement(Ink.Text,{key:`row-${index}`,wrap:'truncate',...style(row)},text(row)));
    const edge={...(theme.colors.warning?{color:theme.colors.warning}:{}),...(session.paintBackground&&theme.colors.background?{backgroundColor:theme.colors.background}:{})};
    const top=projectTrustTopBorder(head?.text??'',size.columns,capabilities.unicode);
    const topRow=React.createElement(Ink.Text,{key:'top',wrap:'truncate'},React.createElement(Ink.Text,edge,top.lead),React.createElement(Ink.Text,roleStyle(['warnbg','b'],theme.colors),top.band),React.createElement(Ink.Text,edge,top.tail));
    const box=React.createElement(Ink.Box,{flexDirection:'column',borderStyle:capabilities.unicode?'round':'classic',borderTop:false,...(theme.colors.warning?{borderColor:theme.colors.warning}:{}),...(session.paintBackground&&theme.colors.background?{borderBackgroundColor:theme.colors.background}:{})/* UI Phase 0 D2 */,paddingX:1,flexShrink:0},...children);
    const frame=terminalFrameProps({session,...(theme.colors.background?{background:theme.colors.background}:{}),rows:size.rows,columns:size.columns});
    return React.createElement(Ink.Box,frame,React.createElement(Ink.Box,{flexDirection:'column',flexShrink:0},topRow,box));
  }

  const rendered=Ink.render(React.createElement(Prompt),{
    stdin,stdout,exitOnCtrlC:false,
    interactive:session.mode==='plain'?false:capabilities.interactive,
    alternateScreen:session.alternateScreen,
  });
  const exitPromise=rendered.waitUntilExit().then(()=>{if(!settled)settle('cancel');},()=>{if(!settled)settle('cancel');});
  try{
    const choice=await choicePromise;
    await exitPromise;
    return choice;
  }finally{sizeStore.dispose();}
}
