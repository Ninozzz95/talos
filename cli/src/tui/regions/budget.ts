/*
 * R1 lane L — ONE height budget per frame (gate E1, E3, E13; owner decisions Q-R1-3, Q-R1-8).
 *
 * Pure: it receives the frame height and the exact row counts of the content (composer lines, chrome lines, the rows a
 * panel asks for) and returns the height of every region. The regions are then rendered as boxes of EXACTLY these
 * heights with their overflow hidden, so the sum of the rendered rows equals `frameRows` by construction and a region
 * whose content is taller is clipped instead of overwriting its neighbours (review D-02). No row count here is an
 * estimate: every input is counted by the same width function Ink lays text out with (text-width.ts, E4).
 */
import {t} from '../../i18n/index.ts';

export const MIN_COLUMNS=40;
export const MIN_ROWS=12;
/* R2 (Q-R2-10): the notice is on acceptance frames (s12), so its words are the dictionary's; the bytes did not change. */
export const TOO_SMALL_TEXT=t('screen.layout.tooSmall',{columns:MIN_COLUMNS,rows:MIN_ROWS});
/* A panel whose budget is below this many rows takes the whole frame instead of a sliver (Q-R1-3). */
export const PANEL_FULL_SCREEN_BELOW=6;
export const COMPOSER_MAX_ROWS=10;
const BAND_LEAVES=2;

export type PanelRequest=number|null;// rows the panel needs including its border; Infinity = "as much as allowed"
export type BudgetInput={
  rows:number;columns:number;// the terminal
  frameRows:number;// the root frame (terminal-shell.ts decides rows vs rows − 1, Q-R1-6)
  composerLines:number;// wrapped content rows of the composer text (≥ 1)
  composerFrame?:number;// rows around the text: the border's two, or Zen's one blank row (FE-048); default 2
  composerHints:number;// hint rows under the text (vim mode, "Shift+Enter newline")
  overlay?:PanelRequest;menu?:PanelRequest;diff?:PanelRequest;aux?:PanelRequest;
  header:number;shortcut:number;roster:number;extras:number;footer:number;
  /* R5a S9 (review D-14): the activity row above the composer; 0 when there is nothing to say (idle), default 1. */
  status?:number;
  /* Stage 3: a card in the composer's place (the question card) asks for its own height, borders included; it takes at
     most the frame less the activity row and one transcript row, and the composer's text and hints are not drawn. */
  composerRows?:number;cardKeepsFooter?:boolean;/* B2: a page takes the centre under the header: no transcript and no activity row */page?:boolean;
  /* FE-048: the queue's band above the composer; it gives way to two rows of conversation, and a card or a page has none */
  band?:number;
};
export type Budget={
  tooSmall:boolean;frameRows:number;fullScreenPanel:boolean;
  header:number;transcript:number;diff:number;overlay:number;aux:number;menu:number;status:number;
  composer:number;composerContent:number;composerHints:number;band:number;
  shortcut:number;roster:number;extras:number;footer:number;
  /* The most rows any overlay may use (contract with lane O: `maxRows`): frame − composer − 1 status row (Q-R1-3). */
  overlayMaxRows:number;
};

const whole=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.floor(n)):0;};
const request=(value:PanelRequest|undefined)=>value===null||value===undefined?0:value===Infinity?Infinity:whole(value);

export function composerRowsCap(rows:number){return Math.max(3,Math.min(COMPOSER_MAX_ROWS,Math.floor(whole(rows)/3)));}

export function budget(input:BudgetInput):Budget{
  const rows=whole(input.rows),columns=whole(input.columns),frameRows=Math.max(1,Math.min(rows,whole(input.frameRows)));
  const zero={header:0,transcript:0,diff:0,overlay:0,aux:0,menu:0,status:0,composer:0,composerContent:0,composerHints:0,band:0,shortcut:0,roster:0,extras:0,footer:0,overlayMaxRows:0};
  if(columns<MIN_COLUMNS||rows<MIN_ROWS)return{tooSmall:true,frameRows,fullScreenPanel:false,...zero};
  /* Composer: border + text + hints, capped at min(10, ⌊rows/3⌋) (E3). Hints go first when the cap bites; the text
     keeps at least one row, and a longer text scrolls inside the composer to the cursor. */
  const cap=composerRowsCap(rows);
  const composerFrame=input.composerFrame??2;
  const status=input.page?0:input.status===undefined?1:Math.min(1,whole(input.status));
  /* a card leaves the footer on screen (MAPPA, finding 4), so the mode and `ctx` stay at 40×12; only the QR code may take its rows */
  const card=input.composerRows===undefined?null:Math.max(1,Math.min(whole(input.composerRows),frameRows-status-(input.page?whole(input.header):1)-(input.cardKeepsFooter?whole(input.footer)+whole(input.shortcut):0)));
  const composerHints=card!==null?0:Math.min(whole(input.composerHints),Math.max(0,cap-3));
  const composerContent=card!==null?0:Math.max(1,Math.min(Math.max(1,whole(input.composerLines)),cap-composerFrame-composerHints));
  const composer=card??composerFrame+composerContent+composerHints;
  const overlayMaxRows=Math.max(0,frameRows-composer-status);
  const wants={overlay:request(input.overlay),menu:request(input.menu),diff:request(input.diff),aux:request(input.aux)};
  const anyPanel=wants.overlay>0||wants.menu>0||wants.diff>0||wants.aux>0;
  if(anyPanel&&overlayMaxRows<PANEL_FULL_SCREEN_BELOW){
    /* Q-R1-3: a panel squeezed below six rows is unusable; it takes the frame. Unreachable at ≥ 40×12 with the
       composer cap above (frame ≥ 11, composer ≤ 4, status 1 → ≥ 6), kept for a frame policy that changes. */
    const first=wants.overlay>0?'overlay':wants.menu>0?'menu':wants.diff>0?'diff':'aux';
    return{tooSmall:false,frameRows,fullScreenPanel:true,...zero,[first]:frameRows,overlayMaxRows:frameRows};
  }
  let room=overlayMaxRows;
  const take=(want:number)=>{const got=Math.min(want,room);room-=got;return got;};
  const overlay=take(wants.overlay),menu=take(wants.menu),diff=take(wants.diff),aux=take(wants.aux);
  /* Chrome after the panels, kept in this order while it fits, so it is DROPPED in the reverse order the owner set:
     roster (and its queue/reasoning lines) first, then the shortcut strip, then the header, the footer last (E13).
     Without a panel the transcript keeps at least one row. */
  const transcriptMin=input.page||overlay+menu+diff+aux>0?0:1;
  let spare=room-transcriptMin;
  const keep=(want:number)=>{const n=whole(want);if(n<=spare){spare-=n;return n;}return 0;};
  /* under a card the mode row goes before the header: the mode is what the card depends on */
  const footer=keep(input.footer),shortcutFirst=input.cardKeepsFooter?keep(input.shortcut):null,header=keep(input.header),shortcut=shortcutFirst??keep(input.shortcut),roster=keep(input.roster),extras=roster||!whole(input.roster)?keep(input.extras):0;
  /* UI Phase 0 (owner 27/09): the footer often has no agent rows now; the queue and reasoning lines then keep their own
     room. Only a roster that was there and got DROPPED takes them with it (the E13 order above). */
  const band=card!==null?0:Math.min(whole(input.band),Math.max(0,spare+transcriptMin-BAND_LEAVES));spare-=band;
  const transcript=spare+transcriptMin;
  return{tooSmall:false,frameRows,fullScreenPanel:false,header,transcript,diff,overlay,aux,menu,status,composer,composerContent,composerHints,band,shortcut,roster,extras,footer,overlayMaxRows};
}

/* The sum of every region; equals `frameRows` for every budget that is not "too small" (asserted by the grid test). */
export function budgetRows(b:Budget){return b.header+b.transcript+b.diff+b.overlay+b.aux+b.menu+b.status+b.band+b.composer+b.shortcut+b.roster+b.extras+b.footer;}
