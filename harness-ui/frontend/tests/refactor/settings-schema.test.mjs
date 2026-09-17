import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SETTINGS_SECTIONS, CHAT_FIELDS, FIELD_HELP, sectionForField, normalizeSearch, buildSettingsIndex, searchSettings } from '../../src/features/settings/schema.ts';
import { CAMPI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI } from '../../src/components/impostazioni-campi.js';
import { CONTROLLI_MIGRATI } from '../../src/components/theme-studio.js';
const index = () => buildSettingsIndex(CAMPI_IMPOSTAZIONI, CONTROLLI_MIGRATI, 'it', s=>s);

test('SET-01 preserves all ten destinations and all forty stable setting IDs', () => {
  assert.deepEqual(Object.keys(SETTINGS_SECTIONS), SEZIONI_IMPOSTAZIONI.map(s=>s.id));
  assert.equal(CAMPI_IMPOSTAZIONI.length,40);
  assert.equal(new Set(index().map(e=>e.id)).size,index().length);
  for (const field of CAMPI_IMPOSTAZIONI) { assert.ok(FIELD_HELP[field.id]); assert.ok(index().some(e=>e.id===field.id)); }
});
test('SET-01 migrated theme controls remain search destinations, not hidden matches', () => {
  for (const id of CONTROLLI_MIGRATI) { const entry=index().find(e=>e.id===id); assert.equal(entry.studio,true,id); assert.equal(entry.section,'appearance'); }
  assert.ok(searchSettings(index(),'bilanciata').some(e=>e.id==='motionQualitySelect' && e.studio));
});
test('SET-01 separates six reading/writing controls without changing their values contract', () => {
  assert.equal(CHAT_FIELDS.size,6);
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
  for (const [term,id] of [['api key','providers'],['permessi','tools'],['backup','account'],['privacy','privacy'],['hugging face','models'],['billing','costi']]) {
    assert.ok(searchSettings(index(),term).some(e=>e.id===id),term);
  }
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
  assert.equal((app.match(/cambiaSezione: setSettingsSection, defaultValues: DESKTOP_APPEARANCE_DEFAULTS/g)||[]).length,3);
  assert.match(app,/talos:settings-persisted.*saved: true/);assert.match(app,/talos:settings-persisted.*saved: false/);
  assert.match(app,/if \(!salvaImpostazioniDesktop\(letto\)\) throw/);
});

// Visual review: help must describe the actual range unit, not invent milliseconds.
test('SET-01 motion duration help follows the percent control contract', () => {
  assert.equal(CAMPI_IMPOSTAZIONI.find(f=>f.id==='motionDurationRange').unita, '%');
  assert.match(FIELD_HELP.motionDurationRange.en, /percentage/);
  assert.doesNotMatch(FIELD_HELP.motionDurationRange.it, /millisecondi/);
});
