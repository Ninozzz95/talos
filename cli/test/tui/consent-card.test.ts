/*
 * 0.6.15 remote control: the folder consent card (consent-card.ts), pure. «Not now» first; Enter answers the selection; Esc is
 * «Not now»; the arrows and Tab move between the two; the two pills answer at once; the folder and the note wrap, never cut.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {consentCardClick,consentCardKey,consentCardRows,openConsentCard} from '../../src/tui/consent-card.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const NOW=1_800_000_000_000;
const card=(folder='C:\\work\\shop-api')=>openConsentCard({richiestaId:'c1',device:'Pad di Nino',folder,expiresAt:NOW+125_000});
const text=(rows:ReturnType<typeof consentCardRows>)=>rows.map(row=>row.map(s=>s.text).join(''));

test('Not now is selected first: an Enter typed ahead never grants a folder',()=>{
  assert.equal(card().choice,'not-now');
  assert.deepEqual(consentCardKey(card(),{name:'return'}).outcome,{kind:'answer',allow:false});
});

test('the arrows and Tab move the choice; Enter answers it; Esc is always «Not now»',()=>{
  for(const name of ['left','right','tab','up','down']){
    const moved=consentCardKey(card(),{name}).state;
    assert.equal(moved.choice,'allow',name);
    assert.deepEqual(consentCardKey(moved,{name:'return'}).outcome,{kind:'answer',allow:true},name);
    assert.deepEqual(consentCardKey(moved,{name:'escape'}).outcome,{kind:'answer',allow:false},name);
  }
  assert.deepEqual(consentCardKey(card(),{name:'x',text:'y'}).outcome,{kind:'none'},'a letter does nothing');
});

test('the pills answer at once; another action is not the card\'s',()=>{
  assert.deepEqual(consentCardClick(card(),'consent:allow')?.outcome,{kind:'answer',allow:true});
  assert.deepEqual(consentCardClick(card(),'consent:not-now')?.outcome,{kind:'answer',allow:false});
  assert.equal(consentCardClick(card(),'open'),null);
});

test('the rows: title with the time left, the device, the folder, the note, the two pills',()=>{
  const lines=text(consentCardRows(card(),100,NOW));
  assert.match(lines[0]!,/A device asks for a folder · answer within 2:05/u);
  assert.ok(lines.some(line=>line.includes('Allow “Pad di Nino” to work in this folder?')));
  assert.ok(lines.some(line=>line.includes('C:\\work\\shop-api')));
  assert.ok(lines.some(line=>line.includes(' Allow ')&&line.includes(' Not now ')));
  assert.match(lines.at(-1)!,/^╰─+╯$/u);
  const rows=consentCardRows(card(),100,NOW);
  const pill=(action:string)=>rows.flat().find(s=>s.action===action)!;
  assert.ok(pill('consent:not-now').roles.includes('pill'),'the selected one is the pill');
  assert.ok(pill('consent:allow').roles.includes('dim'));
});

test('at 60 columns the folder and the note wrap: every character of the path is on screen, no row wider than the card',()=>{
  const folder='C:\\Users\\testuser\\Desktop\\projects\\a-very-long-project-folder-name\\packages\\shop-api';
  const lines=text(consentCardRows(card(folder),60,NOW));
  for(const line of lines)assert.ok(displayWidth(line)<=60,`${displayWidth(line)}: ${line}`);
  const joined=lines.map(line=>line.replace(/^│ +/u,'').trimEnd()).join('');
  assert.ok(joined.includes(folder),'the whole path, in order');
  assert.ok(joined.includes('talos remote folders'),'the note\'s command is whole');
});

test('the time left never goes below 0:00',()=>{
  assert.match(text(consentCardRows(card(),100,NOW+999_000))[0]!,/answer within 0:00/u);
});

/* review block 3 (Desktop, 26/10/2026): at the TUI's narrow widths no row is wider than the card, the folder (no spaces) is whole,
   and so is the question with a long device name (it was cut at 60 columns) */
{
  const folder='C:\\Users\\testuser\\Desktop\\projects\\a-very-long-project-name-without-any-space\\packages\\server\\src\\handlers';
  const strip=(s:string)=>s.replace(/[│╭╰─╮╯]/gu,'').replace(/\s+/gu,'');
  for(const width of [30,40,60,80]){
    test(`width ${width}: rows inside, the folder whole, the question whole`,()=>{
      const rows=consentCardRows(openConsentCard({richiestaId:'c1',device:'Pad di Nino con un nome lungo',folder,expiresAt:120_000}),width,0);
      const lines=text(rows);
      assert.deepEqual(lines.filter(l=>displayWidth(l)>width),[],`rows wider than ${width}`);
      const code=rows.filter(row=>row.some(s=>s.roles.includes('code'))).map(row=>row.map(s=>s.text).join('')).join('');
      assert.equal(strip(code),strip(folder),'the folder is complete');
      assert.ok(strip(lines.join('')).includes(strip('Allow “Pad di Nino con un nome lungo” to work in this folder?')),'the question is whole');
    });
  }
}

/* review 4 of the Desktop (C-1, C-2, C-3): every key owner, alone, makes the card wait; none, and the card may open */
test('the card waits for every key owner, each on its own (the confirmations, the menu, the scrollback, sheets, panels)',async()=>{
  const {consentCardWaits}=await import('../../src/tui/consent-card.ts');
  const none={overlay:null,fullAccess:false,tooLarge:false,exit:false,commandMenu:false,nativeScrollback:false,sheet:false,transcriptMode:false,panel:false,panelInUse:false};
  assert.equal(consentCardWaits(none),false);
  assert.equal(consentCardWaits({...none,overlay:'consent'}),false,'its own overlay never blocks it');
  for(const owner of ['fullAccess','tooLarge','exit','commandMenu','nativeScrollback','sheet','transcriptMode','panel','panelInUse'] as const)
    assert.equal(consentCardWaits({...none,[owner]:true}),true,owner);
  for(const overlay of ['approval','question','plan','elicit','help','model'])assert.equal(consentCardWaits({...none,overlay}),true,overlay);
});

/* review 5 of the Desktop (D-1), owner 26/10/2026 «Aspetta che smetti»: the agents panel counts while it is used, not while open */
test('the right panel holds the card while it is used, and lets it open once idle',async()=>{
  const {consentPanelInUse,CONSENT_PANEL_IDLE_MS}=await import('../../src/tui/consent-card.ts');
  assert.equal(consentPanelInUse({holdsKeys:true,lastKeyAt:1000},1000),true);
  assert.equal(consentPanelInUse({holdsKeys:true,lastKeyAt:1000},1000+CONSENT_PANEL_IDLE_MS-1),true);
  assert.equal(consentPanelInUse({holdsKeys:true,lastKeyAt:1000},1000+CONSENT_PANEL_IDLE_MS),false,'idle: the card opens');
  assert.equal(consentPanelInUse({holdsKeys:true,lastKeyAt:null},1000),false,'a panel never used does not hide the card');
  assert.equal(consentPanelInUse({holdsKeys:false,lastKeyAt:1000},1000),false,'a panel without the focus does not');
});
