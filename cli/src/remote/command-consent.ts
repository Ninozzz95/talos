/*
 * 0.6.15 T5 (the approved plan PIANO-0615-REMOTO.md: «Fuori dalla TUI la mostra `talos remote`»): when `talos remote` hosts remote
 * control itself — no TALOS window open — a paired device that asks for a folder gets the same card a window shows (consent-card.ts:
 * «Allow “<device>” to work in <folder>?», the full path, «Not now» selected first, the approvals' grace, a choice not kept across an
 * interruption). It sits between the terminal's keys and the pairing flow: while the card is open the keys answer it and the pairing
 * waits; answered, expired or answered on the device, the pairing's last frame comes back. Only the person answers (never the model,
 * Full access does not apply). When a window hosts, that window shows the card and this is not used.
 */
import {APPROVAL_GRACE_MS} from '../tui/overlays/approval-dialog.ts';
import {consentCardKey,consentCardRows,openConsentCard,type ConsentCardState,type ConsentKey} from '../tui/consent-card.ts';
import type {CardRow} from '../tui/question-card-rows.ts';
import type {PairingKey} from './pairing-flow.ts';
import type {RemoteRow,RemoteStyle} from './pairing-view.ts';
import type {TuiRemoteConsent} from './tui-remote.ts';

export type CommandConsentSource={
  /** the requests waiting now, oldest first */
  list():Promise<TuiRemoteConsent[]>;
  /** called when a request appears, is answered or expires; returns the unsubscribe */
  listen(onChange:()=>void):()=>void;
  answer(requestId:string,allow:boolean):Promise<void>;
};

/** The card's rows in `talos remote`'s styles (terminal.ts `paintRow`): the selected pill bold in the accent, the other dim. */
export function cardRowToRemote(row:CardRow):RemoteRow{
  return row.map(segment=>{
    const roles=new Set(segment.roles);
    const style:RemoteStyle=roles.has('pill')?'accentBold':roles.has('acc')?(roles.has('b')?'accentBold':'accent'):roles.has('code')?'accent':roles.has('b')?'bold':roles.has('faint')?'faint':roles.has('dim')?'dim':'plain';
    return{text:segment.text,style};
  });
}

const CARD_KEYS:Partial<Record<string,ConsentKey['name']>>={esc:'escape',enter:'return',up:'up',down:'down',left:'left',right:'right',tab:'tab'};

export function createCommandConsent(input:{source:CommandConsentSource;keys:{next():Promise<PairingKey|null>};paint:(rows:CardRow[])=>string[];
  draw:(lines:string[])=>void;width:()=>number;now?:()=>number;graceMs?:number;
  setInterval?:(fn:()=>void,ms:number)=>any;clearInterval?:(timer:any)=>void}){
  const now=input.now??Date.now;const grace=input.graceMs??APPROVAL_GRACE_MS;
  let pending:TuiRemoteConsent[]=[];let card:ConsentCardState|null=null;let shownAt=0;let lastFrame:string[]|null=null;let stopped=false;
  const queue:(PairingKey|null)[]=[];const waiters:((key:PairingKey|null)=>void)[]=[];
  const deliver=(key:PairingKey|null)=>{const waiter=waiters.shift();if(waiter)waiter(key);else queue.push(key);};
  const show=()=>{if(card&&!stopped)input.draw(input.paint(consentCardRows(card,Math.max(40,input.width()),now())));};
  const restore=()=>{if(lastFrame&&!stopped)input.draw(lastFrame);};
  const sync=()=>{
    if(card&&!pending.some(c=>c.richiestaId===card!.richiestaId)){card=null;restore();}
    const first=pending[0];
    /* a new card, or one shown again, starts on «Not now» with its own grace (R-D) */
    if(!card&&first){card=openConsentCard(first);shownAt=now();}
    show();
  };
  const refresh=async()=>{try{pending=await input.source.list();}catch{return;}if(!stopped)sync();};
  const off=input.source.listen(()=>{void refresh();});
  /* the countdown, and a request that expired with no event */
  const timer=(input.setInterval??((fn,ms)=>setInterval(fn,ms)))(()=>{if(card)void refresh();},1000);
  timer?.unref?.();
  const onCardKey=(key:PairingKey)=>{
    if(!card||now()-shownAt<grace)return;
    const name=typeof key==='string'?CARD_KEYS[key]:undefined;
    if(!name)return;
    const result=consentCardKey(card,{name});
    if(result.outcome.kind!=='answer'){card=result.state;show();return;}
    const answered=card;card=null;
    pending=pending.filter(c=>c.richiestaId!==answered.richiestaId);
    restore();
    void input.source.answer(answered.richiestaId,result.outcome.allow).catch(()=>{/* gone meanwhile: nothing was saved */}).finally(()=>{void refresh();});
  };
  void (async()=>{
    for(;;){
      const key=await input.keys.next();
      if(stopped)return;
      if(card&&key!==null){onCardKey(key);continue;}
      deliver(key);
      if(key===null)return;
    }
  })();
  return{
    /** the keys the pairing flow reads: none while the card is open */
    keys:{next():Promise<PairingKey|null>{if(queue.length)return Promise.resolve(queue.shift()!);return new Promise(resolve=>waiters.push(resolve));}},
    /** the pairing's frame: drawn now, or kept for when the card closes */
    draw(lines:string[]){lastFrame=lines;if(!card)input.draw(lines);},
    start:()=>refresh(),
    /** the card open now (tests) */
    open:()=>card,
    stop(){stopped=true;off();(input.clearInterval??((t:any)=>clearInterval(t)))(timer);},
  };
}
