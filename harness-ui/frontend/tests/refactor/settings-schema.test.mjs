import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SETTINGS_SECTIONS, CHAT_FIELDS, FIELD_HELP, sectionForField, normalizeSearch, buildSettingsIndex, searchSettings, SEZIONI_RITIRATE, risolviSezioneImpostazioni } from '../../src/features/settings/schema.ts';
import { CAMPI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI } from '../../src/components/impostazioni-campi.js';
import { CONTROLLI_MIGRATI } from '../../src/components/theme-studio.js';
const index = () => buildSettingsIndex(CAMPI_IMPOSTAZIONI, CONTROLLI_MIGRATI, 'it', s=>s);

/* 23/09/2026, decisione owner esplicita (ledger R4 «DESK-COMPOSER-STANDARD-2026-09-23»): l'intera
   impostazione «Forma del composer» (`composerShapeSelect`) è tolta, resta solo il composer Standard.
   Quaranta ID diventano trentanove, e i controlli di lettura/scrittura da sei diventano cinque. */
/* 23/09/2026, decisione owner: «Provider e accessi» è tolta del tutto («Toglierla del tutto»): le
   destinazioni da dieci diventano NOVE, e l'elenco si scrive per intero — un conteggio da solo non
   direbbe QUALE è sparita. I fornitori vivono solo in Laboratorio modelli → scheda «Provider». */
/* 24/09/2026, decisione owner 35: «Scadenza delle domande» (Nessuna / 1 / 5 / 10 minuti) entra nella sezione Chat.
   Trentanove ID diventano QUARANTA e i controlli di lettura/scrittura da cinque diventano sei. */
test('SET-01 preserves all nine destinations and all forty stable setting IDs', () => {
  assert.deepEqual(Object.keys(SETTINGS_SECTIONS), SEZIONI_IMPOSTAZIONI.map(s=>s.id));
  assert.deepEqual(Object.keys(SETTINGS_SECTIONS), ['appearance','chat','tools','memoria','privacy','models','costi','workspace','account']);
  assert.equal(SEZIONI_IMPOSTAZIONI.some(s=>s.id==='providers'||s.titolo==='Provider e accessi'),false,'«Provider e accessi» è stata tolta dall owner');
  assert.equal(CAMPI_IMPOSTAZIONI.length,40);
  assert.ok(CAMPI_IMPOSTAZIONI.some(f=>f.id==='askTimeoutSelect'),'la scadenza delle domande è un\'impostazione (decisione owner 35)');
  assert.equal(CAMPI_IMPOSTAZIONI.some(f=>f.id==='composerShapeSelect'),false,'la forma del composer è stata tolta dall owner');
  assert.equal(new Set(index().map(e=>e.id)).size,index().length);
  for (const field of CAMPI_IMPOSTAZIONI) { assert.ok(FIELD_HELP[field.id]); assert.ok(index().some(e=>e.id===field.id)); }
});
test('SET-01 migrated theme controls remain search destinations, not hidden matches', () => {
  for (const id of CONTROLLI_MIGRATI) { const entry=index().find(e=>e.id===id); assert.equal(entry.studio,true,id); assert.equal(entry.section,'appearance'); }
  assert.ok(searchSettings(index(),'bilanciata').some(e=>e.id==='motionQualitySelect' && e.studio));
});
test('SET-01 separates six reading/writing controls without changing their values contract', () => {
  assert.equal(CHAT_FIELDS.size,6);
  assert.ok(CHAT_FIELDS.has('askTimeoutSelect'));
  for (const id of CHAT_FIELDS) {
    const f=CAMPI_IMPOSTAZIONI.find(f=>f.id===id);assert.ok(f);assert.equal(sectionForField(f),'chat');assert.equal(f.sezione,'chat');
  }
});
test('SET-01 search normalizes accents, supports terms and includes option labels', () => {
  assert.equal(normalizeSearch('  MODALITÀ  '),'modalita');
  assert.ok(searchSettings(index(),'modalita colore').some(e=>e.id==='colorModeSelect'));
  assert.ok(searchSettings(index(),'elastica').some(e=>e.id==='motionEasingSelect'));
  assert.equal(searchSettings(index(),'zz-no-setting').length,0);
  assert.equal(searchSettings(index(),'   ').length,0);
});
test('SET-01 infrastructure sections without legacy setting rows are searchable', () => {
  for (const [term,id] of [['api key','models'],['permessi','tools'],['backup','account'],['privacy','privacy'],['hugging face','models'],['billing','costi']]) {
    assert.ok(searchSettings(index(),term).some(e=>e.id===id),term);
  }
});
/* 23/09/2026, decisione owner — la ricerca delle parole dei fornitori porta a un posto VERO: il
   Laboratorio modelli (che ha la scheda «Provider»), mai a un vuoto e mai a una sezione tolta. */
test('SET-01 provider words lead to the Model laboratory, never to an empty result or a removed section', () => {
  for (const term of ['provider','chiave','api key','fornitori','openrouter','credenziali','endpoint','accessi']) {
    const trovati = searchSettings(index(),term);
    assert.ok(trovati.length > 0, `«${term}» non deve dare un risultato vuoto`);
    assert.ok(trovati.some(e=>e.kind==='section'&&e.id==='models'), `«${term}» deve portare a Laboratorio modelli`);
    assert.equal(trovati.some(e=>e.id==='providers'||e.section==='providers'), false, `«${term}» porta a una sezione tolta`);
  }
});
/* 23/09/2026 — l'indirizzo vecchio si RINVIA (semantica del 301), non ricade su «Aspetto». */
test('SET-01 the retired providers id redirects to Model laboratory → Provider tab', () => {
  assert.deepEqual(risolviSezioneImpostazioni('providers'), { section: 'models', labTab: 'providers' });
  assert.deepEqual(risolviSezioneImpostazioni('models'), { section: 'models', labTab: null });
  assert.deepEqual(risolviSezioneImpostazioni('appearance'), { section: 'appearance', labTab: null });
  assert.equal(risolviSezioneImpostazioni('inesistente'), null);
  assert.equal(risolviSezioneImpostazioni('__proto__'), null);
  assert.equal(risolviSezioneImpostazioni(undefined), null);
  // Un indirizzo ritirato non è MAI anche una sezione viva: sarebbero due case per lo stesso nome.
  for (const id of Object.keys(SEZIONI_RITIRATE)) assert.equal(Object.hasOwn(SETTINGS_SECTIONS, id), false, id);
});
test('SET-01 index never consumes input values or credentials', () => {
  const fields=CAMPI_IMPOSTAZIONI.map(f=>({...f,value:'fixture-private-key',password:'fixture-password'}));
  assert.doesNotMatch(JSON.stringify(buildSettingsIndex(fields, CONTROLLI_MIGRATI, 'en',s=>s)),/fixture-private-key|fixture-password/);
});
test('SET-01 current and translated labels remain findable', () => {
  const english=buildSettingsIndex(CAMPI_IMPOSTAZIONI,CONTROLLI_MIGRATI,'en',s=>s==='Testo chat'?'Conversation text':s);
  assert.ok(searchSettings(english,'Testo chat').some(e=>e.id==='chatFontScaleSelect'));
  assert.ok(searchSettings(english,'Conversation text').some(e=>e.id==='chatFontScaleSelect'));
});
test('SET-01 production entry imports the settings stylesheet and passes canonical defaults', async () => {
  const css=await readFile(new URL('../../src/styles/main.css',import.meta.url),'utf8');assert.match(css,/design-system\/settings\.css/);
  const app=await readFile(new URL('../../src/legacy/app.js',import.meta.url),'utf8');
  const mounts = app.split('\n').filter(line => /^\s*montaImpostazioni\(/.test(line));
  assert.ok(mounts.length >= 3);
  for (const mount of mounts) {
    assert.match(mount, /defaultValues: DESKTOP_APPEARANCE_DEFAULTS/);
    assert.match(mount, /ripristinaAspetto: resettaAspettoDesktop/);
  }
  assert.match(app,/talos:settings-persisted.*saved: true/);assert.match(app,/talos:settings-persisted.*saved: false/);
  assert.match(app,/if \(!salvaImpostazioniDesktop\(letto\)\) throw/);
});

// Visual review: help must describe the actual range unit, not invent milliseconds.
test('SET-01 motion duration help follows the percent control contract', () => {
  assert.equal(CAMPI_IMPOSTAZIONI.find(f=>f.id==='motionDurationRange').unita, '%');
  assert.match(FIELD_HELP.motionDurationRange.en, /percentage/);
  assert.doesNotMatch(FIELD_HELP.motionDurationRange.it, /millisecondi/);
});
