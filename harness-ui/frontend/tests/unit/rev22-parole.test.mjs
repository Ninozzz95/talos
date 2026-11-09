import test from 'node:test';
import assert from 'node:assert/strict';
import { letturaDellaCatena } from '../../src/components/carta-compattazione.js';
import { interpretaEventoCompattazione, percheDellaCatena, testoRigaCompattazione } from '../../src/components/compattazione-legacy.js';
import { etichettaSeparatoreContesto } from '../../src/components/context-separator.js';
import { chiaveDelMotivo, nomeCortoDelModello, oraDelLimite } from '../../src/components/motivi-compattazione.js';
import { trascriviEventoInterno } from '../../src/components/trascrizione-eventi-interni.js';
import { nomeModelloUmano } from '../../src/components/chat-foot.js';
import { impostaLingua } from '../../src/components/lingua.js';

/* Revisione avversaria del Blocco 22 (01/11/2026): le REV22 da A a G sono nate rosse sui difetti F3-F12 del rapporto, ognuna sull'ultima asserzione; le cure le hanno fatte
   verdi. Le «2» e «3» sono le prove delle cure, scritte prima della cura. */
impostaLingua('it');

const SCELTO = { ruolo: 'scelto', modello: 'z-ai/glm-5.3-flash', stato: 'pronto', origine: 'scelta' };
const SENZA = { ruolo: 'senza-modello', modello: null, stato: 'pronto' };
const VERSIONE = { schema: 'talos.context.event.v1', id: 'e1', sessionId: 's1', versionId: 'v1', kind: 'context.version.committed', createdAt: '2026-11-01T10:00:00.000Z' };

test('REV22-A — un limite senza ora (429 senza Retry-After, ogni 5xx) non lascia la frase a metà', () => {
  const frase = percheDellaCatena({ nonDisponibile: { modello: 'z-ai/glm-5.3-flash', stato: 'bloccato', motivo: 'limite' }, dallaRiserva: true });
  assert.ok(frase.includes('glm-5.3-flash'), 'premessa: la frase c\'è');
  assert.doesNotMatch(frase, /fino alle \.|until \./u);
});

test('REV22-B — un motivo che il server non ha scritto non diventa una chiave grezza', () => {
  assert.equal(chiaveDelMotivo({ motivo: 'sconosciuto' }), 'notFound', 'premessa: lo sconosciuto ha la sua parola');
  assert.equal(chiaveDelMotivo({ motivo: 'constructor' }), 'notFound');
});

test('REV22-C — un finoAlle fuori dal calendario non fa esplodere la riga', () => {
  assert.equal(typeof oraDelLimite(1_800_000_000_000, 'it'), 'string', 'premessa: un\'ora vera si scrive');
  assert.doesNotThrow(() => percheDellaCatena({ nonDisponibile: { modello: 'a/b', motivo: 'limite', finoAlle: 1e20 } }));
});

test('REV22-C2 — lo stesso sulla carta', () => {
  assert.doesNotThrow(() => letturaDellaCatena([{ ...SCELTO, stato: 'bloccato', motivo: 'limite', finoAlle: 1e20 }, SENZA]));
});

test('REV22-D — una variante di OpenRouter non diventa il nome del modello', () => {
  assert.equal(nomeModelloUmano('meta-llama/llama-4:free'), 'llama-4:free', 'premessa: il nome della chat');
  const riga = etichettaSeparatoreContesto({ ...VERSIONE, payload: { coveredThrough: 3, provenienza: { riassuntoDi: 'meta-llama/llama-4:free', dallaRiserva: true } } });
  assert.match(riga, /llama-4/u);
});

test('REV22-E — la riga dell\'avviso sta nel trascritto con le parole della chat, non col JSON', () => {
  const evento = { type: 'CUSTOM', name: 'talos.riassunto-modello-inutilizzabile', value: { schema: 'talos.riassunto-modello-inutilizzabile.v1', threadId: 's1', runId: 'r1', at: '2026-11-01T10:00:00.000Z', modello: 'z-ai/glm-5.3-flash', motivo: 'senza-chiave', scelto: 'persona', ruolo: 'scelto' } };
  assert.equal(typeof nomeCortoDelModello(evento.value.modello), 'string', 'premessa');
  assert.notEqual(trascriviEventoInterno(evento), null);
});

test('REV22-F — una firma senza nome non scrive una riga vuota', () => {
  const riga = etichettaSeparatoreContesto({ ...VERSIONE, payload: { coveredThrough: 3, provenienza: { riassuntoDi: '', dallaRiserva: true } } });
  assert.equal(typeof riga, 'string', 'premessa');
  assert.doesNotMatch(riga, /di {2}\(/u);
});

test('REV22-G — un limite che torna fra tre giorni dice il giorno', () => {
  const fra3Giorni = Date.now() + 3 * 86_400_000;
  const { frase } = letturaDellaCatena([{ ...SCELTO, stato: 'bloccato', motivo: 'limite', finoAlle: fra3Giorni, diAccount: true }, SENZA]);
  assert.ok(frase.includes('fino alle') || frase.includes('until'), 'premessa: la frase dice l\'attesa');
  const giorno = new Date(fra3Giorni).getDate();
  assert.match(frase, new RegExp(`\\b${giorno}\\b`, 'u'));
});

const NEL_MODELLO = (motivo, extra = {}) => ({ modello: 'z-ai/glm-5.3-flash', motivo, ...extra });
const inInglese = (fn) => { impostaLingua('en'); try { return fn(); } finally { impostaLingua('it'); } };

test('REV22-A2 — senza ora ogni limite ha la sua frase, nelle due lingue; con l\'ora resta quella di prima', () => {
  assert.equal(percheDellaCatena({ nonDisponibile: NEL_MODELLO('limite'), dallaRiserva: true }), 'glm-5.3-flash è fermo per il limite del fornitore. Questa compattazione l’ha scritta la riserva.');
  assert.equal(percheDellaCatena({ nonDisponibile: NEL_MODELLO('limite', { diAccount: true }) }), 'glm-5.3-flash è fermo per il limite del piano. Questa compattazione l’ha fatta TALOS senza il modello.');
  assert.equal(inInglese(() => percheDellaCatena({ nonDisponibile: NEL_MODELLO('limite'), dallaRiserva: true })), 'glm-5.3-flash is stopped by the provider limit. The backup wrote this compaction.');
  assert.equal(inInglese(() => percheDellaCatena({ nonDisponibile: NEL_MODELLO('limite', { diAccount: true }) })), 'glm-5.3-flash is stopped by the plan limit. TALOS made this compaction without the model.');
  assert.match(percheDellaCatena({ nonDisponibile: NEL_MODELLO('limite', { finoAlle: Date.now() + 60_000 }) }), /fino alle \d/u, 'al contrario: con l\'ora la frase la dice');
});

test('REV22-A3 — anche l\'avviso della carta non resta a metà', () => {
  assert.equal(letturaDellaCatena([{ ...SCELTO, stato: 'inutilizzabile', motivo: 'limite' }, SENZA]).avviso.testo, 'glm-5.3-flash è fermo per il limite del fornitore.');
});

test('REV22-B2 — nessun nome del prototipo fa da motivo; quelli veri restano', () => {
  for (const motivo of ['__proto__', 'toString', 'hasOwnProperty', 'valueOf']) assert.equal(chiaveDelMotivo({ motivo }), 'notFound', motivo);
  assert.equal(chiaveDelMotivo({ motivo: 'rete' }), 'network', 'al contrario');
});

test('REV22-C3 — il punto solo: fuori calendario vale «senza ora» nell\'evento, sulla carta e nella riga', () => {
  const finoAlleDi = (finoAlle) => interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, at: 'a', tokenPrima: 2, tokenDopo: 1, nonDisponibile: NEL_MODELLO('limite', { finoAlle }) } }).nonDisponibile.finoAlle;
  assert.equal(finoAlleDi(1_800_000_000_000), 1_800_000_000_000, 'al contrario: un\'ora vera resta');
  assert.equal(finoAlleDi(8.64e15), 8.64e15, 'il bordo è dentro il calendario');
  for (const fuori of [8.64e15 + 1, -8.64e15 - 1, 1e20, Infinity, NaN, '1800000000000']) assert.equal(finoAlleDi(fuori), null, String(fuori));
  assert.equal(oraDelLimite(1e20, 'it'), '');
  assert.equal(letturaDellaCatena([{ ...SCELTO, stato: 'bloccato', motivo: 'limite', finoAlle: 1e20 }, SENZA]).frase, letturaDellaCatena([{ ...SCELTO, stato: 'bloccato', motivo: 'limite' }, SENZA]).frase);
  assert.equal(percheDellaCatena({ nonDisponibile: NEL_MODELLO('limite', { finoAlle: 1e20 }) }), percheDellaCatena({ nonDisponibile: NEL_MODELLO('limite') }));
});

test('REV22-D2 — il ripiego del nome è quello della chat', () => {
  for (const id of ['meta-llama/llama-4:free', 'z-ai/glm-5.3-flash', 'chatgpt:gpt-6-luna', 'openrouter:autore/m', '~anthropic/claude-sonnet-latest', 'local:unsloth/Qwen3-Q4_K_M.gguf']) assert.equal(nomeCortoDelModello(id), nomeModelloUmano(id), id);
  assert.equal(nomeCortoDelModello('meta-llama/llama-4:free'), 'llama-4:free');
  assert.equal(nomeCortoDelModello(null), '');
});

test('REV22-E2 — la frase del trascritto è quella della riga col suo perché, e un evento storto resta sconosciuto', () => {
  const evento = (valore) => ({ type: 'CUSTOM', name: 'talos.riassunto-modello-inutilizzabile', value: valore });
  const buono = { modello: 'z-ai/glm-5.3-flash', motivo: 'senza-chiave', scelto: 'persona', ruolo: 'scelto' };
  assert.deepEqual(trascriviEventoInterno(evento(buono)), { testo: 'glm-5.3-flash non è disponibile: Manca la chiave per glm-5.3-flash.' });
  assert.deepEqual(inInglese(() => trascriviEventoInterno(evento(buono))), { testo: 'glm-5.3-flash is not available: There is no key for glm-5.3-flash.' });
  assert.equal(trascriviEventoInterno(evento({ ...buono, modello: 42 })), null);
  assert.equal(trascriviEventoInterno(evento(null)), null);
});

test('REV22-F2 — un nome che non dice niente non firma la riga, su nessuna strada', () => {
  const senzaNome = (riassuntoDi) => etichettaSeparatoreContesto({ ...VERSIONE, payload: { coveredThrough: 3, provenienza: { riassuntoDi, dallaRiserva: true } } });
  const compattato = etichettaSeparatoreContesto({ ...VERSIONE, payload: { coveredThrough: 3 } });
  for (const nome of ['', '   ', '/']) assert.equal(senzaNome(nome), compattato, JSON.stringify(nome));
  assert.notEqual(senzaNome('qwen/qwen3.7-flash'), compattato, 'al contrario: un nome vero firma');
  assert.doesNotMatch(testoRigaCompattazione({ stato: 'riassunta', dallaRiserva: true, riassuntoDi: '   ' }), /riserva/u);
  const interpretata = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, at: 'a', dallaRiserva: true, riassuntoDi: '   ' } });
  assert.equal(interpretata.dallaRiserva, undefined);
});

test('REV22-G2 — oggi solo l\'ora; un altro giorno anche il giorno, nella lingua dell\'interfaccia', () => {
  const adesso = new Date(2026, 10, 1, 10, 0).getTime();
  assert.equal(oraDelLimite(new Date(2026, 10, 1, 16, 42).getTime(), 'it', adesso), '16:42');
  assert.equal(oraDelLimite(new Date(2026, 10, 2, 0, 5).getTime(), 'it', adesso), '00:05 di lun 2 nov');
  assert.equal(oraDelLimite(new Date(2026, 10, 8, 16, 42).getTime(), 'it', adesso), '16:42 di dom 8 nov', 'mai «del 8»');
  assert.equal(inInglese(() => oraDelLimite(new Date(2026, 10, 2, 0, 5).getTime(), 'en', adesso)), '00:05 on Mon 2 Nov');
  const fra3Giorni = Date.now() + 3 * 86_400_000;
  assert.match(percheDellaCatena({ nonDisponibile: NEL_MODELLO('limite', { finoAlle: fra3Giorni }) }), /fino alle \d\d:\d\d di \p{L}+ \d+ \p{L}+\./u, 'vale anche per il perché della riga');
});
