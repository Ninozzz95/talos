/*
 * 0.6.15: `talos remote` draws the approved pairing mockup to the letter (v3, owner 17/10/2026). Each scene below is the
 * mockup's own terminal text (MOCKUP-ACCOPPIAMENTO-TELEFONO-2026-10-17.html: cliRelay, cliQR, cliCode, cliDone, cliList,
 * Owner 27/10/2026 («Sì, device ovunque»): the mockup's «phone» words read «device», the rest to the letter.
 * cliForgotten, cliRejected, the expired, paused and copied scenes), with the mockup's names (PHONE «Pad di Nino», CODE
 * «482 913») and its styles. The QR follows the mockup's QRT: one light module around, half blocks, two rows per line.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {formatPairingCode,mmss,pairingRows,phoneListRows,qrTextRows,revokedRows,rowsText,type PairingState,type RemoteRow} from '../../src/remote/pairing-view.ts';

const PHONE='Pad di Nino';
const styles=(rows:RemoteRow[])=>rows.map(r=>r.filter(s=>s.text.trim()).map(s=>`${s.style}:${s.text.trim()}`));

test('the relay choice, first time: the mockup\'s cliRelay',()=>{
  const rows=pairingRows({screen:'relay',selected:'n0'});
  assert.deepEqual(rowsText(rows),[
    '  TALOS remote control  ·  first time',
    '',
    '  Away from home, your device reaches this PC through a relay.',
    '  It is end-to-end encrypted: the relay can\'t read anything.',
    '  At home the device connects directly when it can.',
    '',
    '  ❯ Free public relays by n0 (the makers of iroh)',
    '      Works right away. No guarantees, traffic is limited.',
    '    My own relay',
    '      Start talos-relay on a server you own, then paste its address.',
    '',
    '  ↑↓ choose   Enter confirm   change later: talos remote relay',
  ]);
  const s=styles(rows);
  assert.deepEqual(s[0],['accentBold:TALOS remote control','faint:·  first time']);
  assert.deepEqual(s[6],['accent:❯','bold:Free public relays by n0','dim:(the makers of iroh)']);
  assert.deepEqual(s[9],['dim:Start','accent:talos-relay','dim:on a server you own, then paste its address.']);
  /* the other choice selected: the arrow moves, nothing else changes */
  const own=rowsText(pairingRows({screen:'relay',selected:'own'}));
  assert.equal(own[6],'    Free public relays by n0 (the makers of iroh)');
  assert.equal(own[8],'  ❯ My own relay');
});

const qr={lato:21,righe:Array.from({length:21},(_,r)=>Array.from({length:21},(_,c)=>((r*7+c*3)%5===0?'1':'0')).join(''))};

test('the QR scene: the QR, four columns, the mockup\'s words; «Waiting for your device…»; copied',()=>{
  const state:PairingState={screen:'qr',qr,secondsLeft:299};
  const rows=pairingRows(state,{width:120});
  const text=rowsText(rows);
  const q=qrTextRows(qr);
  assert.equal(q.length,12,'(21+2) module rows, two per line, rounded up');
  /* the light module around the matrix: the first line's upper half and the last line's lower half, and the first and last columns */
  assert.ok(![...q[0]!].some(ch=>ch==='▀'||ch==='█'),'top border light');
  assert.ok(![...q.at(-1)!].some(ch=>ch==='▄'||ch==='█'),'bottom border light');
  assert.ok(q.every(line=>line[0]===' '&&line.at(-1)===' '),'side borders light');
  const side=['TALOS remote control','','Scan with the TALOS app on','your device.','','The device will work here as you','do, Full access included.','','End-to-end encrypted. No server','keeps anything.','','expires 4:59  ·  works once','','c copy link   Esc cancel'];
  for(let i=0;i<side.length;i++){
    const left:string=i<q.length?`  ${q[i]}`:' '.repeat(2+23);
    assert.equal(text[i],`${left}    ${side[i]}`,`line ${i}`);
  }
  assert.deepEqual(text.slice(-2),['','  Waiting for your device…']);
  assert.equal(styles(rows).at(-1)![0],'warn:Waiting for your device…');
  assert.deepEqual(styles(rows)[11]!.filter(x=>!x.startsWith('qr:')),['faint:expires','accent:4:59','faint:·  works once']);
  assert.ok(rows[0]!.some(s=>s.style==='qr'),'the QR keeps its own style (dark on light)');
  const copied=rowsText(pairingRows({...state,copied:true},{width:120}));
  assert.equal(copied.at(-1),'  ✓ Pairing link copied. Open it on your device: it works once.');
  /* a narrow terminal: the words under the QR, never cut */
  const narrow=rowsText(pairingRows(state,{width:50}));
  assert.ok(narrow.includes('  Scan with the TALOS app on'));
  assert.ok(narrow.every(line=>[...line].length<=50),'nothing wider than the terminal');
});

test('the code scene: the mockup\'s cliCode, attempts left in the plural and the singular',()=>{
  const rows=pairingRows({screen:'code',phone:PHONE,code:'482913',attemptsLeft:5});
  assert.deepEqual(rowsText(rows),[
    '  Pair “Pad di Nino”?',
    '',
    '  482 913',
    '',
    '  Same number on the device? Then it\'s yours.',
    '  It will work here as you do, Full access included.',
    '',
    '  Enter pair     Esc reject            5 attempts left',
  ]);
  assert.deepEqual(styles(rows)[0],['accentBold:Pair','bold:“Pad di Nino”','accentBold:?']);
  assert.deepEqual(styles(rows)[2],['sas:482 913']);
  assert.match(rowsText(pairingRows({screen:'code',phone:PHONE,code:'000007',attemptsLeft:1})).at(-1)!,/ 1 attempt left$/u);
  assert.equal(formatPairingCode('645739'),'645 739');
});

test('done, rejected, expired, paused: the mockup\'s words',()=>{
  assert.deepEqual(rowsText(pairingRows({screen:'done',phone:PHONE})),[
    '  ✓ “Pad di Nino” is paired until you revoke it.',
    '',
    '  Remote control is on while TALOS runs here.',
    '  Devices: talos remote list   Revoke: talos remote revoke "Pad di Nino"',
  ]);
  assert.deepEqual(rowsText(pairingRows({screen:'rejected',attemptsLeft:4})),[
    '  ✕ Rejected. That QR can\'t be used again.',
    '  4 attempts left before a 15-minute pause.',
    '',
    '  r new QR    Esc close',
  ]);
  assert.deepEqual(rowsText(pairingRows({screen:'expired'})),['  The QR expired after 5 minutes.','','  r new QR    Esc close']);
  assert.deepEqual(rowsText(pairingRows({screen:'paused',until:'13:14'})),[
    '  Too many rejected pairings (5).',
    '  New pairings are paused until 13:14. Paired devices keep working.',
  ]);
  assert.equal(styles(pairingRows({screen:'paused',until:'13:14'}))[1]![1],'accent:13:14');
});

test('talos remote list and revoke: the mockup\'s cliList and cliForgotten',()=>{
  assert.deepEqual(rowsText(phoneListRows([
    {name:PHONE,paired:'17/10 12:41',lastSeen:'now, direct',state:'online'},
    {name:'Pixel ufficio',paired:'02/10 09:15',lastSeen:'yesterday 18:20',state:'offline'},
  ])),[
    '  NAME            PAIRED        LAST SEEN         STATE',
    '  Pad di Nino     17/10 12:41   now, direct       online',
    '  Pixel ufficio   02/10 09:15   yesterday 18:20   offline',
  ]);
  assert.equal(rowsText(phoneListRows([{name:PHONE,paired:'17/10 12:41',lastSeen:'today 12:58',state:'revoked-by-phone'}]))[1],'  Pad di Nino     17/10 12:41   today 12:58       revoked from the device');
  assert.deepEqual(rowsText(revokedRows(PHONE)),['  ✓ Revoked “Pad di Nino”. Its connection was closed.']);
  assert.match(rowsText(phoneListRows([]))[0]!,/No devices are paired/u);
});

test('mmss and the QR drawing',()=>{
  assert.deepEqual([mmss(299),mmss(60),mmss(9),mmss(0),mmss(-3)],['4:59','1:00','0:09','0:00','0:00']);
  /* rows (border, matrix…, border) taken two at a time from the top, as the mockup's QRT: line 0 = border + matrix row 0 */
  assert.deepEqual(qrTextRows({lato:1,righe:['1']}),[' ▄ ','   ']);
  assert.deepEqual(qrTextRows({lato:2,righe:['11','01']}),[' ▄▄ ','  ▀ ']);
  assert.deepEqual(qrTextRows({lato:3,righe:['111','101','111']}),[' ▄▄▄ ',' █▄█ ','     ']);
});
