/*
 * 0.6.15 T4: `/remote` inside the TUI — the approved plan's «la stessa sequenza in un riquadro, con la storia della sessione che
 * resta». The rows are `talos remote`'s own (pairing-view.ts `pairingRows`, the mockup v3 to the letter), in the cards' frame
 * (consent-card.ts), in the place of the composer; the conversation stays above and comes back whole when the card closes.
 * - The card may grow over the conversation while the QR is up; when even the whole frame cannot hold the QR, the «too small»
 *   screen says so and offers the link (owner 26/10/2026, «Dillo e offri il link»).
 * - The QR keeps its dark modules on a light ground whatever the theme (the `qr` role, components/styled-rows.ts).
 * - Keys: the flow's own (pairing-flow.ts): ↑↓ Enter on the relay choice, `c` copies, Enter pairs, Esc rejects or closes, `r` a new QR.
 */
import {t} from '../i18n/index.ts';
import type {PairingKey} from '../remote/pairing-flow.ts';
import {pairingRows,type PairingState,type RemoteRow,type RemoteStyle} from '../remote/pairing-view.ts';
import {fit,type CardRow,type CardSegment} from './question-card-rows.ts';

const ROLE:Record<RemoteStyle,string>={plain:'',dim:'dim',faint:'faint',accent:'acc',accentBold:'acc b',bold:'b',ok:'ok',warn:'warn',bad:'err',sas:'acc b',qr:'qr'};
const seg=(text:string,roles=''):CardSegment=>({text,roles:roles.split(' ').filter(Boolean)});
/* the frame's rows besides the pairing rows: its title and its bottom border */
export const REMOTE_CARD_FRAME_ROWS=2;

/**
 * The card's rows at `width` columns, the pairing screen fitted to `height` rows in all (the frame included). `windowRows` is the
 * whole window's: the «too small» screen names the window's size and the size it needs, never the card's inside.
 */
export function remoteCardRows(state:PairingState,width:number,height:number,windowRows:number=height,administrator=false):CardRow[]{
  const inner=width-4;
  const rows:RemoteRow[]=pairingRows(state,{width:inner,rows:height,reserved:REMOTE_CARD_FRAME_ROWS,around:{columns:width-inner,rows:Math.max(0,windowRows-height)},administrator});
  const body:CardRow[]=[
    [seg('╭─ ','acc'),seg(t('remote.card.title'),'acc b'),seg(t('remote.card.subtitle'),'dim')],
    ...rows.map(row=>row.map(segment=>seg(segment.text,ROLE[segment.style]))),
  ];
  return[...body.map(row=>[seg('│ ','acc'),...fit(row,inner+1)]),[seg(`╰${'─'.repeat(Math.max(0,width-2))}╯`,'acc')]];
}

/** An Ink key as the pairing flow reads it; null for a key the flow has no use for. */
export function pairingKeyOf(ch:string,key:{upArrow?:boolean;downArrow?:boolean;return?:boolean;escape?:boolean;backspace?:boolean;delete?:boolean;ctrl?:boolean;meta?:boolean}):PairingKey|null{
  if(key.upArrow)return'up';
  if(key.downArrow)return'down';
  if(key.return)return'enter';
  if(key.escape)return'esc';
  if(key.backspace||key.delete)return'backspace';
  if(key.ctrl||key.meta||!ch||/[\u0000-\u001f\u007f]/u.test(ch))return null;
  return{char:ch};
}
