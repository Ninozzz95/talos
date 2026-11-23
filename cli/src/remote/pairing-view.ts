/*
 * 0.6.15 remote control: what `talos remote` and `/remote` draw, as rows of styled segments, from a pairing state. Pure: the
 * same rows are printed by the command and drawn by the TUI, and the tests compare them with the approved mockup line by line
 * (MOCKUP-ACCOPPIAMENTO-TELEFONO-2026-10-17.html v3, binding to the letter, owner 17/10/2026). The mockup's terminal styles map
 * to `RemoteStyle`: `.d` dim, `.f` faint, `.a` accent, `.ab` accent bold, `.b` bold, `.okc` ok, `.w` warn, `.bad` bad,
 * `.sas` the code, `.qrblk` the QR (dark modules on a light ground).
 * The QR is the mockup's own drawing (its QRT): one light module around the matrix, two rows per text line with the half
 * blocks ▀ ▄ █; the matrix is the kernel's (`moduliDelQr`, error correction M, as Happy and Codex pair).
 */
import {t,tn} from '../i18n/index.ts';
import {displayWidth} from '../tui/text-width.ts';

export type RemoteStyle='plain'|'dim'|'faint'|'accent'|'accentBold'|'bold'|'ok'|'warn'|'bad'|'sas'|'qr';
export type RemoteSegment={text:string;style:RemoteStyle};
export type RemoteRow=RemoteSegment[];
export type QrModules={lato:number;righe:readonly string[]};
export type PairingState=
  |{screen:'relay';selected:'n0'|'own'}
  |{screen:'relay-address';value:string}
  |{screen:'downloading';size:string}
  |{screen:'qr';qr:QrModules;secondsLeft:number;copied?:boolean}
  |{screen:'code';phone:string;code:string;attemptsLeft:number}
  |{screen:'done';phone:string}
  |{screen:'rejected';attemptsLeft:number}
  |{screen:'expired'}
  |{screen:'paused';until:string};

const seg=(text:string,style:RemoteStyle='plain'):RemoteSegment=>({text,style});
const blank:RemoteRow=[];

/** «4:59», as the mockup's `mmss`. */
export function mmss(seconds:number):string{const s=Math.max(0,Math.floor(seconds));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
/** «482 913»: the six digits in two groups of three, as on the phone. */
export function formatPairingCode(code:string):string{const digits=String(code).replace(/\D/gu,'');return digits.length===6?`${digits.slice(0,3)} ${digits.slice(3)}`:digits;}
/** The phone's name as the mockup quotes it, “like this”. */
export function quoted(name:string):string{return `“${name}”`;}

/** The QR as text: one light module around the matrix, then two module rows per line (the mockup's QRT). */
export function qrTextRows(qr:QrModules):string[]{
  const n=qr.lato;
  const dark=(r:number,c:number)=>r>=1&&c>=1&&r<=n&&c<=n&&qr.righe[r-1]?.[c-1]==='1';
  const out:string[]=[];
  for(let r=0;r<n+2;r+=2){
    let line='';
    for(let c=0;c<n+2;c++){const top=dark(r,c),bottom=dark(r+1,c);line+=top&&bottom?'█':top?'▀':bottom?'▄':' ';}
    out.push(line);
  }
  return out;
}

function keys(...pairs:[string,string][]):RemoteRow{
  const row:RemoteRow=[seg('  ')];
  for(const [key,label] of pairs){row.push(seg(key,'accent'),seg(label));}
  return row;
}

function qrSide(state:Extract<PairingState,{screen:'qr'}>,administrator=false):RemoteRow[]{
  return[
    [seg(t('remote.title'),'accentBold')],
    blank,
    [seg(t('remote.qr.scan1'))],[seg(t('remote.qr.scan2'))],
    blank,
    [seg(t('remote.qr.works1'),'dim')],[seg(t('remote.qr.works2'),'dim')],
    /* owner 27/10/2026 («Ammetterla con avviso»): pairing in an administrator window says what the device gets */
    ...(administrator?[[seg(t('remote.qr.admin1'),'warn')],[seg(t('remote.qr.admin2'),'warn')]]:[]),
    blank,
    [seg(t('remote.qr.e2e1'),'dim')],[seg(t('remote.qr.e2e2'),'dim')],
    blank,
    [seg(t('remote.qr.expires'),'faint'),seg(mmss(state.secondsLeft),'accent'),seg(t('remote.qr.once'),'faint')],
    blank,
    [seg('c','accent'),seg(t('remote.qr.copy'),'dim'),seg('Esc','accent'),seg(t('remote.qr.cancel'),'dim')],
  ];
}
const rowWidth=(row:RemoteRow)=>row.reduce((n,s)=>n+[...s.text].length,0);
/* the widest line of the side column, measured on its own words */
const SIDE_WIDTH=34;

function qrRows(state:Extract<PairingState,{screen:'qr'}>,width:number,administrator=false):RemoteRow[]{
  const qr=qrTextRows(state.qr);
  const side=qrSide(state,administrator);
  const qrWidth=qr[0]?.length??0;
  const rows:RemoteRow[]=[];
  if(width>=2+qrWidth+4+SIDE_WIDTH){
    /* side by side, as the mockup: the QR, four columns, the text (`.qrside{margin-left:4ch}`) */
    const lines=Math.max(qr.length,side.length);
    for(let i=0;i<lines;i++){
      const q=qr[i];
      const left:RemoteRow=q===undefined?[seg(' '.repeat(2+qrWidth))]:[seg('  '),seg(q,'qr')];
      rows.push([...left,seg('    '),...(side[i]??[])]);
    }
  }else{
    /* a narrow terminal: the QR first, the words under it */
    for(const q of qr)rows.push([seg('  '),seg(q,'qr')]);
    rows.push(blank);
    for(const line of side)rows.push(line.length?[seg('  '),...line]:blank);
  }
  rows.push(blank);
  rows.push(state.copied?[seg('  '),seg(t('remote.qr.copied'),'ok')]:[seg('  '),seg(t('remote.qr.waiting'),'warn')]);
  return rows;
}

/*
 * T4 (measured 26/10/2026, RICERCA-T4-QR-ALTEZZA.md): the QR is 22–30 terminal rows tall, and a frame taller than the window is cut at
 * its top (unscannable) and, redrawn every second, leaves stale copies in the scrollback. No competitor checks the window; here a
 * window too small for the QR says so (owner «Dillo e offri il link»): its size and the size needed, how to make room, and the
 * copy key, with the time left. The next redraw (every second, or a resize) shows the QR as soon as it fits.
 */
/* a sentence of the «too small» screen, in rows of at most `width` columns, broken between words (a word longer than a row is cut) */
function wrapWords(text:string,width:number):string[]{
  const limit=Math.max(8,width);const rows:string[]=[];let row='';
  for(const word of text.split(' ')){
    const next=row?`${row} ${word}`:word;
    if(displayWidth(next)<=limit){row=next;continue;}
    if(row)rows.push(row);
    row=displayWidth(word)<=limit?word:[...word].slice(0,limit).join('');
  }
  if(row)rows.push(row);
  return rows;
}
function qrTooSmallRows(state:Extract<PairingState,{screen:'qr'}>,size:{needColumns:number;needRows:number;columns:number;rows:number},width:number):RemoteRow[]{
  const lines=(text:string,style:RemoteStyle):RemoteRow[]=>wrapWords(text,width-2).map(line=>[seg(`  ${line}`,style)]);
  return[
    [seg('  '),seg(t('remote.title'),'accentBold')],
    blank,
    ...lines(t('remote.qr.tooSmall',size),'warn'),
    ...lines(t('remote.qr.tooSmallHow'),'dim'),
    ...lines(t('remote.qr.tooSmallLink'),'dim'),
    blank,
    [seg('  '),seg(t('remote.qr.expires'),'faint'),seg(mmss(state.secondsLeft),'accent'),seg(t('remote.qr.once'),'faint')],
    blank,
    [seg('  '),seg('c','accent'),seg(t('remote.qr.copy'),'dim'),seg('Esc','accent'),seg(t('remote.qr.cancel'),'dim')],
    blank,
    state.copied?[seg('  '),seg(t('remote.qr.copied'),'ok')]:[seg('  '),seg(t('remote.qr.waiting'),'warn')],
  ];
}

/**
 * The rows of one pairing screen. `width` is the terminal's columns (the QR moves above its words when they do not fit beside it).
 * `rows`, when given, is the window's height and `reserved` the rows the caller draws besides these (the command: a blank row and
 * the cursor's): a QR screen that would not fit becomes the «too small» screen.
 */
export function pairingRows(state:PairingState,{width=120,rows,reserved=2,around={columns:0,rows:0},administrator=false}:{width?:number;rows?:number;reserved?:number;
  /** owner 27/10/2026: the device will act with administrator rights (the QR and the code say so) */
  administrator?:boolean;
  /** what the caller draws around these rows (the TUI card: its borders, the screen's header and footer), so the sizes the «too
      small» screen names are the WINDOW's */
  around?:{columns:number;rows:number}}={}):RemoteRow[]{
  if(state.screen==='qr'&&rows!==undefined){
    const drawn=qrRows(state,width,administrator);
    const qr=qrTextRows(state.qr);
    const qrColumns=2+(qr[0]?.length??0);
    if(drawn.length+reserved>rows||qrColumns>width){
      /* the size that is easiest to reach: the QR beside its words (wider, shorter) unless that is not shorter than the words below it */
      const side=qrSide(state,administrator).length;
      const beside={columns:qrColumns+4+SIDE_WIDTH,rows:Math.max(qr.length,side)+2+reserved};
      const below={columns:qrColumns,rows:qr.length+1+side+2+reserved};
      const need=beside.rows<below.rows?beside:below;
      return qrTooSmallRows(state,{needColumns:need.columns+around.columns,needRows:need.rows+around.rows,columns:width+around.columns,rows:rows+around.rows},width);
    }
    return drawn;
  }
  switch(state.screen){
    case'relay':{
      const n0=state.selected==='n0';
      return[
        [seg('  '),seg(t('remote.title'),'accentBold'),seg(t('remote.firstTime'),'faint')],
        blank,
        [seg(`  ${t('remote.relay.lead')}`)],
        [seg(`  ${t('remote.relay.encrypted')}`,'dim')],
        [seg(`  ${t('remote.relay.direct')}`,'dim')],
        blank,
        n0?[seg('  ❯ ','accent'),seg(t('remote.relay.n0'),'bold'),seg(t('remote.relay.n0Who'),'dim')]:[seg(`    ${t('remote.relay.n0')}`),seg(t('remote.relay.n0Who'),'dim')],
        [seg(`      ${t('remote.relay.n0Note')}`,'dim')],
        n0?[seg(`    ${t('remote.relay.own')}`)]:[seg('  ❯ ','accent'),seg(t('remote.relay.own'),'bold')],
        [seg(`      ${t('remote.relay.ownNoteStart')}`,'dim'),seg(t('remote.relay.ownNoteCommand'),'accent'),seg(t('remote.relay.ownNoteEnd'),'dim')],
        blank,
        [seg('  ↑↓','accent'),seg(t('remote.keys.choose'),'dim'),seg('Enter','accent'),seg(t('remote.keys.confirm'),'dim'),seg(t('remote.keys.changeLater'),'faint'),seg(t('remote.keys.changeLaterCommand'),'accent')],
      ];
    }
    case'relay-address':return[
      [seg('  '),seg(t('remote.title'),'accentBold'),seg(t('remote.firstTime'),'faint')],
      blank,
      [seg(`  ${t('remote.relay.addressPrompt')}`),seg(state.value,'bold')],
      blank,
      [seg('  Enter','accent'),seg(t('remote.relay.addressKeys'),'dim'),seg('Esc','accent'),seg(t('remote.relay.addressBack'),'dim')],
    ];
    case'downloading':return[[seg(`  ${t('remote.component.downloading',{size:state.size})}`,'dim')]];
    case'qr':return qrRows(state,width,administrator);
    case'code':return[
      [seg('  '),seg(t('remote.code.pair'),'accentBold'),seg(quoted(state.phone),'bold'),seg('?','accentBold')],
      blank,
      [seg('  '),seg(formatPairingCode(state.code),'sas')],
      blank,
      [seg(`  ${t('remote.code.same')}`,'dim')],
      [seg(`  ${t('remote.code.works')}`,'dim')],
      ...(administrator?[[seg(`  ${t('remote.code.administrator')}`,'warn')]]:[]),
      blank,
      [seg('  Enter','accent'),seg(t('remote.code.pairKey')),seg('Esc','accent'),seg(t('remote.code.rejectKey')),seg(`            ${tn('remote.code.attempts',state.attemptsLeft)}`,'faint')],
    ];
    case'done':return[
      [seg('  ✓ ','ok'),seg(quoted(state.phone),'bold'),seg(t('remote.done.paired'),'ok')],
      blank,
      [seg(`  ${t('remote.done.whileRuns')}`,'dim')],
      [seg(`  ${t('remote.done.phones')}`,'dim'),seg('talos remote list','accent'),seg(t('remote.done.revoke'),'dim'),seg(`talos remote revoke "${state.phone}"`,'accent')],
    ];
    case'rejected':return[
      [seg(`  ${t('remote.rejected')}`,'bad')],
      [seg(`  ${tn('remote.rejected.attempts',state.attemptsLeft)}`,'dim')],
      blank,
      keys(['r',t('remote.newQr')],['Esc',t('remote.close')]),
    ];
    case'expired':return[
      [seg(`  ${t('remote.expired')}`,'warn')],
      blank,
      keys(['r',t('remote.newQr')],['Esc',t('remote.close')]),
    ];
    case'paused':return[
      [seg(`  ${t('remote.paused')}`,'bad')],
      [seg(`  ${t('remote.pausedUntil')}`,'dim'),seg(state.until,'accent'),seg(t('remote.pausedKeep'),'dim')],
    ];
  }
}

export type PhoneListRow={name:string;paired:string;lastSeen:string;state:'online'|'offline'|'revoked-by-phone'};
const pad=(text:string,n:number)=>text+' '.repeat(Math.max(0,n-[...text].length));
/** `talos remote list`, as the mockup's cliList: the header, then one phone per line. */
export function phoneListRows(phones:readonly PhoneListRow[]):RemoteRow[]{
  if(!phones.length)return[[seg(`  ${t('remote.list.empty')}`,'dim')]];
  const rows:RemoteRow[]=[[seg(`  ${pad(t('remote.list.name'),16)}${pad(t('remote.list.paired'),14)}${pad(t('remote.list.seen'),18)}${t('remote.list.state')}`,'faint')]];
  for(const p of phones){
    const state=p.state==='online'?seg(t('remote.list.online'),'ok'):p.state==='offline'?seg(t('remote.list.offline'),'dim'):seg(t('remote.list.revokedByPhone'),'warn');
    rows.push([seg(`  ${pad(p.name,16)}${pad(p.paired,14)}${pad(p.lastSeen,18)}`),state]);
  }
  return rows;
}
export function revokedRows(name:string):RemoteRow[]{return[[seg(`  ${t('remote.revoked',{name})}`,'ok')]];}

/* T5, `talos remote folders`: per device, the folders it may work in — name, full path (on this PC only), when and how it was allowed */
/* blocked folders step B: a block is listed too (`blocked`, its time in `allowedAt`): the device cannot reach it, not even through a
   folder it is allowed */
export type FolderListRow={name:string;path:string;allowedAt:string;from:'anticipo'|'chat'|'domanda';exists:boolean;blocked?:boolean};
export function folderListRows(devices:readonly {name:string;folders:readonly FolderListRow[]}[]):RemoteRow[]{
  if(!devices.length)return[[seg(`  ${t('remote.list.empty')}`,'dim')]];
  const nameWidth=Math.max(4,...devices.flatMap(d=>d.folders.map(f=>[...f.name].length)))+3;
  const rows:RemoteRow[]=[];
  for(const device of devices){
    rows.push([seg('  '),seg(device.name,'bold')]);
    if(!device.folders.length){rows.push([seg(`    ${t('remote.folders.none')}`,'dim')]);continue;}
    for(const f of device.folders){
      if(f.blocked){
        rows.push([seg(`    ${f.name.padEnd(nameWidth)}`),seg(f.path,'accent'),seg(`   ${t('remote.folders.blockedAt',{when:f.allowedAt})}`,'warn'),...(f.exists?[]:[seg(` · ${t('remote.folders.missing')}`,'warn')])]);
        continue;
      }
      const how=[t('remote.folders.allowedAt',{when:f.allowedAt}),t(`remote.folders.from.${f.from}`)].join(' · ');
      rows.push([seg(`    ${f.name.padEnd(nameWidth)}`),seg(f.path,'accent'),seg(`   ${how}`,'dim'),...(f.exists?[]:[seg(` · ${t('remote.folders.missing')}`,'warn')])]);
    }
  }
  return rows;
}

/** Plain text of rows (no colours): `--no-color`, a file, the tests. */
export function rowsText(rows:readonly RemoteRow[]):string[]{return rows.map(row=>row.map(s=>s.text).join(''));}
export {rowWidth};
