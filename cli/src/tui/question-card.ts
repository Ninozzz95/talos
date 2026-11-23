/*
 * Stage 3, interactive requests (owner 01/10 and 02/10, registro 12): the card TALOS shows when the model asks the person
 * (`ask_user_question`, kernel `UserQuestionRequested`). Until now the CLI had no reference to it at all, so the turn waited
 * forever behind a «thinking» counter. Behaviour copied from the approved mockup (step «domande del modello», golden frames
 * step-03-*): one tab per question, the why in italics, numbered options with «(Recommended)», «Other» with free text,
 * multiple choice with [x] and space, a preview next to the options from 100 columns, a note per answer with Tab, a single
 * question skipped with ctrl+], a review before sending, esc cancels, a countdown from the person's setting.
 * Sources: Codex `tui/src/bottom_pane/request_user_input/{mod,state,render}.rs` (tabs, «None of the above» with notes,
 * countdown); Claude Code AskUserQuestion (header, preview, «Review your answers», annotations); OpenCode `tool/question.ts`
 * («Unanswered»); Claude Code 2.1.274 (a note never moves or changes the highlighted option). Pure: state in, state and
 * outcome out; the screen and the clock live in the app. Words from i18n/en/question.ts.
 */
import {t} from '../i18n/index.ts';
import type {QuestionResponse} from '../runtime/types.ts';

export type CardOption={label:string;description:string;recommended?:boolean;preview?:string};
export type CardQuestion={id:string;header?:string;question:string;why?:string;options?:CardOption[];multiSelect?:boolean};
export type QuestionCardState={
  /* stage 6b: the task of the sub-agent that asks; absent for the main session's own question */
  asker?:string;
  requestId:string;questions:CardQuestion[];deadline:number|null;
  qi:number;sel:number;review:boolean;
  answers:Record<string,string|string[]>;picks:Record<string,string[]>;skipped:string[];notes:Record<string,string>;
  /* `back`: the free-text answer being written when Tab opened the note, given back when the note closes (review 1) */
  editing:null|{kind:'note'|'other'|'free';text:string;back?:string};
};
export type CardKey={name:string;ctrl?:boolean;text?:string};
export type CardOutcome={kind:'none'}|{kind:'send';response:QuestionResponse};

export function openQuestionCard({requestId,questions,now,timeoutMs,asker}:{requestId:string;questions:CardQuestion[];now:number;timeoutMs:number|null;asker?:string|undefined}):QuestionCardState{
  const first=questions[0];
  return{...(asker!==undefined?{asker}:{}),requestId,questions,deadline:timeoutMs===null?null:now+timeoutMs,qi:0,sel:0,review:false,answers:{},picks:{},skipped:[],notes:{},
    editing:first&&!first.options?{kind:'free',text:''}:null};
}

/* A title for the tab: the model's header, else the id in words («session_wait» → «Session wait»), cut to 12. */
export function tabTitle(question:CardQuestion):string{
  if(question.header)return question.header;
  const words=question.id.split('_').filter(Boolean);
  let title='';
  for(const word of words){const next=title?`${title} ${word}`:word;if(next.length>12)break;title=next;}
  title||=words[0]!.slice(0,12);
  return title.charAt(0).toUpperCase()+title.slice(1);
}

/* Options as shown: the model's, then «Other» for a closed question (Codex «None of the above», Claude Code «Other»). */
export function shownOptions(question:CardQuestion):Array<CardOption&{other?:true}>{
  return question.options?[...question.options,{label:t('screen.question.other'),description:t('screen.question.other.description'),other:true}]:[];
}

export function unansweredCount(state:QuestionCardState):number{
  return state.questions.filter(q=>state.answers[q.id]===undefined).length;
}

/* What the kernel receives (kernel contract, user-question-contract.mjs): every question answered or skipped; all skipped is
   `skipped`; notes only for questions the card showed. */
export function responseOf(state:QuestionCardState):QuestionResponse{
  const answered=state.questions.filter(q=>state.answers[q.id]!==undefined);
  if(answered.length===0)return{status:'skipped'};
  const skipped=state.questions.filter(q=>state.answers[q.id]===undefined).map(q=>q.id);
  const notes=Object.fromEntries(Object.entries(state.notes).filter(([,text])=>text.trim()!==''));
  return{status:'answered',answers:Object.fromEntries(answered.map(q=>[q.id,state.answers[q.id]!])),
    ...(skipped.length?{skipped}:{}),...(Object.keys(notes).length?{notes}:{})};
}

function nextQuestion(state:QuestionCardState):QuestionCardState{
  if(state.qi<state.questions.length-1){
    const qi=state.qi+1;const question=state.questions[qi]!;
    return{...state,qi,sel:0,editing:question.options?null:{kind:'free',text:typeof state.answers[question.id]==='string'?String(state.answers[question.id]):''}};
  }
  return{...state,review:true,editing:null};
}
function goTo(state:QuestionCardState,qi:number):QuestionCardState{
  const question=state.questions[qi]!;
  return{...state,qi,sel:0,review:false,editing:question.options?null:{kind:'free',text:typeof state.answers[question.id]==='string'?String(state.answers[question.id]):''}};
}
function answer(state:QuestionCardState,id:string,value:string|string[]):QuestionCardState{
  return{...state,answers:{...state.answers,[id]:value},skipped:state.skipped.filter(x=>x!==id)};
}
function pick(state:QuestionCardState):QuestionCardState{
  const question=state.questions[state.qi]!;const options=shownOptions(question);const chosen=options[state.sel]!;
  if(chosen.other)return{...state,editing:{kind:'other',text:''}};
  if(question.multiSelect){
    const picks=state.picks[question.id]?.length?state.picks[question.id]!:[chosen.label];
    return nextQuestion(answer({...state,picks:{...state.picks,[question.id]:picks}},question.id,[...picks]));
  }
  return nextQuestion(answer(state,question.id,chosen.label));
}

export function questionCardKey(state:QuestionCardState,key:CardKey):{state:QuestionCardState;outcome:CardOutcome}{
  const none=(next:QuestionCardState)=>({state:next,outcome:{kind:'none'} as CardOutcome});
  const question=state.questions[state.qi]!;
  if(state.editing){
    const editing=state.editing;
    if(editing.kind==='note'){
      /* Review 1 (Codex, verified): closing a note on a free-text question left the card with no answer to type into;
         it goes back to the answer, with what was written before the note. */
      const after=question.options?null:{kind:'free' as const,text:editing.back??''};
      if(key.name==='escape')return none({...state,editing:after});
      if(key.name==='return'||key.name==='tab')return none({...state,editing:after,notes:{...state.notes,[question.id]:editing.text}});
    }else{
      if(key.name==='escape'&&editing.kind==='other')return none({...state,editing:null});
      if(key.name==='escape')return{state,outcome:{kind:'send',response:{status:'cancelled'}}};
      if(key.name==='return'){
        const text=editing.text.trim();if(!text)return none(state);
        const value=question.multiSelect?[...(state.picks[question.id]??[]),text]:text;
        return none(nextQuestion(answer({...state,editing:null},question.id,value)));
      }
      if(key.name==='tab'&&editing.kind==='free')return none({...state,editing:{kind:'note',text:state.notes[question.id]??'',back:editing.text}});
    }
    if(key.name==='backspace')return none({...state,editing:{...editing,text:[...editing.text].slice(0,-1).join('')}});
    if(key.text&&!key.ctrl)return none({...state,editing:{...editing,text:editing.text+key.text}});
    return none(state);
  }
  if(state.review){
    if(key.name==='return')return{state,outcome:{kind:'send',response:responseOf(state)}};
    if(key.name==='left')return none(goTo(state,state.questions.length-1));
    if(key.name==='escape')return{state,outcome:{kind:'send',response:{status:'cancelled'}}};
    return none(state);
  }
  const options=shownOptions(question);const count=options.length;
  if(key.name==='down'&&count)return none({...state,sel:(state.sel+1)%count});
  if(key.name==='up'&&count)return none({...state,sel:(state.sel-1+count)%count});
  if(key.name==='right')return none(state.qi<state.questions.length-1?goTo(state,state.qi+1):state);
  if(key.name==='left')return none(state.qi>0?goTo(state,state.qi-1):state);
  if(key.name==='tab')return none({...state,editing:{kind:'note',text:state.notes[question.id]??''}});
  if(key.name==='space'&&question.multiSelect&&state.sel<(question.options?.length??0)){
    const label=question.options![state.sel]!.label;const current=state.picks[question.id]??[];
    const picks=current.includes(label)?current.filter(x=>x!==label):[...current,label];
    return none({...state,picks:{...state.picks,[question.id]:picks}});
  }
  if(key.text&&/^[1-9]$/u.test(key.text)&&Number(key.text)<=count)return none(pick({...state,sel:Number(key.text)-1}));
  if(key.name==='return'&&count)return none(pick(state));
  if(key.name===']'&&key.ctrl){
    const {[question.id]:_dropped,...answers}=state.answers;
    return none(nextQuestion({...state,answers,skipped:[...new Set([...state.skipped,question.id])]}));
  }
  if(key.name==='escape')return{state,outcome:{kind:'send',response:{status:'cancelled'}}};
  return none(state);
}

/** Stage 6c «tutto cliccabile» (mockup `click`: opt, qtab, send). A click goes through the card's own steps: a choice is
 *  picked like its digit (a choice of a multiple question toggles like Space, «Other» opens its text), a tab opens its
 *  question, «Send answers» sends the review and «Change» (qtab:0) leaves it. Null for a click the card cannot take. */
export function questionCardClick(state:QuestionCardState,action:string):{state:QuestionCardState;outcome:CardOutcome}|null{
  const none=(next:QuestionCardState)=>({state:next,outcome:{kind:'none'} as CardOutcome});
  const [verb,arg]=action.split(':');const index=Number(arg);
  if(verb==='send')return state.review?{state,outcome:{kind:'send',response:responseOf(state)}}:null;
  if(verb==='qtab')return Number.isInteger(index)&&index>=0&&index<state.questions.length?none(goTo(state,index)):null;
  if(verb!=='opt'||state.review)return null;
  const question=state.questions[state.qi]!;
  if(!(Number.isInteger(index)&&index>=0&&index<shownOptions(question).length))return null;
  const at={...state,sel:index,editing:null};
  if(question.multiSelect&&index<(question.options?.length??0))return questionCardKey(at,{name:'space'});
  return none(pick(at));
}

/* A terminal key (Ink's `useInput` pair) as the card reads it; null for keys the card does not take. ctrl+] arrives as
   GS (0x1d) in most terminals. Text (one character or a pasted chunk) only without ctrl/meta. Two keys pressed together
   reach the card in one chunk, the second as its raw byte (measured 02/10: `down` then `tab` gave a bare TAB, the note
   never opened and the next Enter picked the option): TAB, CR, ESC and DEL/BS are read by their bytes too. */
export function cardKeyOf(ch:string,key:Record<string,unknown>):CardKey|null{
  if(key.return||ch==='\r')return{name:'return'};
  if(key.escape||ch==='\x1b')return{name:'escape'};
  if((key.tab||ch==='\t')&&!key.shift)return{name:'tab'};
  if(key.upArrow)return{name:'up'};
  if(key.downArrow)return{name:'down'};
  if(key.leftArrow)return{name:'left'};
  if(key.rightArrow)return{name:'right'};
  if(key.backspace||key.delete||ch==='\x7f'||ch==='\b')return{name:'backspace'};
  if(ch==='\x1d'||(key.ctrl&&ch===']'))return{name:']',ctrl:true};
  if(key.ctrl||key.meta||!ch||/[\x00-\x1f\x7f]/u.test(ch))return null;
  if(ch===' ')return{name:'space',text:' '};
  return{name:[...ch].length===1?ch:'text',text:ch};
}

/* Every key of a terminal chunk, in order. Under load several keys arrive in one chunk and Ink names none of them (measured in
   the gate 02/10: «\tkeep» — a Tab glued to the letters typed after it — was dropped whole, the note never opened). A chunk of
   one character, or one Ink named with ctrl/meta, is one key; a longer one is read byte by byte: ESC [A-D arrows, a lone ESC,
   TAB, CR, DEL/BS, GS (ctrl+]); other control bytes are dropped, never typed; text is one key per character, so a number
   still picks its option. */
const CHUNK_KEYS=/\x1b\[[ABCD]|\x1b|\r\n?|[\t\x7f\x08\x1d]|[\x00-\x1f]|[^\x00-\x1f\x7f]/gu;
const CHUNK_NAMES:Record<string,CardKey>={'\x1b[A':{name:'up'},'\x1b[B':{name:'down'},'\x1b[C':{name:'right'},'\x1b[D':{name:'left'},
  '\x1b':{name:'escape'},'\r':{name:'return'},'\r\n':{name:'return'},'\t':{name:'tab'},'\x7f':{name:'backspace'},'\x08':{name:'backspace'},'\x1d':{name:']',ctrl:true}};
export function cardKeysOf(ch:string,key:Record<string,unknown>):CardKey[]{
  if(typeof ch!=='string'||[...ch].length<=1||key.ctrl||key.meta){const one=cardKeyOf(ch??'',key);return one?[one]:[];}
  const keys:CardKey[]=[];
  for(const token of ch.match(CHUNK_KEYS)??[]){
    const named=CHUNK_NAMES[token];
    if(named){keys.push({...named});continue;}
    if(/^[\x00-\x1f]$/u.test(token))continue;
    keys.push(token===' '?{name:'space',text:' '}:{name:token,text:token});
  }
  return keys;
}

/* The clock: past the deadline the card closes as `expired` (14/10, owner: the turn goes on, the kernel tells the model nobody answered). */
export function questionCardTick(state:QuestionCardState,now:number):CardOutcome{
  return state.deadline!==null&&now>=state.deadline?{kind:'send',response:{status:'expired'}}:{kind:'none'};
}

