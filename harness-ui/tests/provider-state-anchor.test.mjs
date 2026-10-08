/*
 * ⛔ P4 (05/10/2026) — L'ANCORA DELLO STATO PROVIDER NEL JOURNAL.
 *
 * Perché esiste (dossier `RICERCA-5x5x5x5-STALL-CONTESTO-STORICO-2026-10-05.md`, §diagnosi persistenza):
 * il kernel allega `talos_provider_state` all'ultimo messaggio assistant SOLO su un giro
 * chiuso pulito (`finishReason ∈ {stop, tool-calls}`, `native-provider-adapter.mjs`), e il
 * registro lo persiste per inciso, DENTRO il messaggio, senza niente su disco che dica
 * «questo stato è fidato, chiusura pulita di provider X modello Y». Una sessione nata sotto
 * una beta e ripresa sotto un'altra (o toccata da una superficie diversa) non ha modo di
 * distinguere uno stato fidato da uno scritto con regole diverse: è la via del blocco
 * «[Historical tool calls]». Il brief P4 (approvato): un record `provider_state
 * {version, provider, model}` — NIENTE content, il content si ricava dal messaggio già
 * persistito — scritto alla chiusura, e al resume lo stato viene RICOSTITUITO/validato dal jsonl.
 *
 * Forma delle precedenti (letta nel codice, 05/10/2026):
 *  · Codex `codex_thread.rs:399-427` conserva il turn ID già registrato: lo stato durevole è
 *    fartuito, non dedotto;
 *  · Hermes `_canonicalize_tool_call_arguments` (+ cache 32 MiB): ciò che si rimanda al provider
 *    è canonico e verificato, mai fidato per inciso;
 *  · Gemini thought signatures: «passing this signature back… restores previous thinking context»
 *    — lo stato che torna indietro deve essere QUELLO del giro chiuso, non uno simile.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ancoraDaStoria,
  validaStoriaRipristinata,
  SCHEMA_ANCORA_STATO_PROVIDER,
} from '../src/provider-state-anchor.mjs';

const stato = (provider, model, extra = {}) => ({
  version: 1, provider, model, content: [{ type: 'text', text: 'blocco nativo privato' }], ...extra,
});

const storiaChiusa = (provider = 'anthropic', model = 'm-1') => ([
  { role: 'system', content: 'istruzioni' },
  { role: 'user', content: 'compito' },
  { role: 'assistant', content: 'Lettura…', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
  { role: 'tool', tool_call_id: 'c1', content: 'contenuto' },
  { role: 'assistant', content: 'fatto', talos_provider_state: stato(provider, model) },
]);

test('ANC-WRITE-1: la storia che SI CHIUDE con un assistant portante lo stato v1 produce l’ancora, senza content', () => {
  const ancora = ancoraDaStoria(storiaChiusa('anthropic', 'm-1'), { at: '2026-10-05T10:00:00.000Z' });
  assert.ok(ancora, 'l’ancora esiste');
  assert.equal(ancora.tipo, 'provider-state');
  assert.equal(ancora.schema, SCHEMA_ANCORA_STATO_PROVIDER);
  assert.equal(ancora.versione, 1);
  assert.equal(ancora.provider, 'anthropic');
  assert.equal(ancora.model, 'm-1');
  assert.equal(ancora.at, '2026-10-05T10:00:00.000Z');
  assert.equal('content' in ancora, false, 'l’ancora NON porta il content: si ricava dal messaggio già persistito');
  assert.equal(Object.keys(ancora).length, 6, 'niente campi in più: il record è piccolo e stabile');
});

test('ANC-WRITE-2: storia che finisce con l’esito di un attrezzo NON produce ancora (nessuna chiusura pulita certificabile)', () => {
  const storia = [...storiaChiusa().slice(0, -1)]; // cade l’assistant finale: resta l’esito del tool
  assert.equal(ancoraDaStoria(storia), null);
});

test('ANC-WRITE-3: nessuno stato, o stato non v1, o content non array ⇒ nessuna ancora', () => {
  assert.equal(ancoraDaStoria([
    { role: 'user', content: 'ciao' },
    { role: 'assistant', content: 'fatto' },
  ]), null, 'caso A (nessuno stato): nessuna ancora, come il brief');
  assert.equal(ancoraDaStoria([
    { role: 'user', content: 'ciao' },
    { role: 'assistant', content: 'fatto', talos_provider_state: { version: 2, provider: 'anthropic', model: 'm', content: [] } },
  ]), null, 'versione sconosciuta: non si certifica ciò che non si conosce');
  assert.equal(ancoraDaStoria([
    { role: 'assistant', content: 'fatto', talos_provider_state: { version: 1, provider: 'anthropic', model: 'm', content: 'corrotto' } },
  ]), null, 'content non array: non è uno stato che il lettore nativo saprebbe riusare');
});

test('ANC-READ-SENZA-ANCORA: journal senza ancore (beta di prima, desktop) ⇒ storia INTATTA, nessun degrado', () => {
  const storia = storiaChiusa();
  const giudizio = validaStoriaRipristinata(storia, null);
  assert.equal(giudizio.esito, 'senza-ancora');
  assert.equal(giudizio.messaggi, storia, 'nessuna copia, nessuna modifica: compatibilità all’indietro');
});

test('ANC-READ-OK: ancora coerente con l’ultimo stato ⇒ certificato, storia intatta', () => {
  const storia = storiaChiusa('anthropic', 'm-1');
  // Un messaggio PIÙ VECCHIO con un altro modello dello stesso provider: legittimo (cambio modello a sessione aperta).
  storia.splice(2, 0, { role: 'assistant', content: 'prima', talos_provider_state: stato('anthropic', 'm-0') });
  const ancora = ancoraDaStoria(storia, { at: '2026-10-05T10:00:00.000Z' });
  const giudizio = validaStoriaRipristinata(storia, ancora);
  assert.equal(giudizio.esito, 'ok');
  assert.equal(giudizio.messaggi, storia, 'coerente: nessun tocco');
});

test('ANC-READ-MODELLO-DIVERSO: ultimo stato in disaccordo con l’ancora ⇒ stati TOGLI e messaggi sani', () => {
  const storia = storiaChiusa('anthropic', 'm-1');
  const senzaStati = storia.map(({ talos_provider_state, ...m }) => m);
  const ancora = { ...ancoraDaStoria(storia), model: 'm-riscritto-da-un-altro-writer' };
  const giudizio = validaStoriaRipristinata(storia, ancora);
  assert.equal(giudizio.esito, 'stato-incoerente');
  assert.deepEqual(giudizio.messaggi, senzaStati, 'i messaggi restano byte per byte, solo lo stato in disaccordo sparisce');
  assert.ok(storia[4].talos_provider_state, 'la storia IN INGRESSO non viene mutata in posto');
});

test('ANC-READ-PROVIDER-DIVERSO: uno stato di un altro provider ⇒ tutti gli stati tolti', () => {
  const storia = storiaChiusa('anthropic', 'm-1');
  storia.splice(2, 0, { role: 'assistant', content: 'intruso', talos_provider_state: stato('gemini', 'gemini-3.8') });
  const ancora = ancoraDaStoria(storia);
  const giudizio = validaStoriaRipristinata(storia, ancora);
  assert.equal(giudizio.esito, 'stato-incoerente');
  assert.equal(giudizio.messaggi.some((m) => m.talos_provider_state), false, 'mai alimentare il provider con uno stato contraddetto dal journal');
});

test('ANC-READ-STATO-PERSO: ancora senza alcuno stato nella storia ⇒ nota onesta, niente invenzioni', () => {
  const storia = storiaChiusa().map(({ talos_provider_state, ...m }) => m);
  const ancora = { tipo: 'provider-state', schema: SCHEMA_ANCORA_STATO_PROVIDER, versione: 1, provider: 'anthropic', model: 'm-1' };
  const giudizio = validaStoriaRipristinata(storia, ancora);
  assert.equal(giudizio.esito, 'stato-assente');
  assert.equal(giudizio.messaggi, storia, 'il content non si inventa: senza messaggio portante non c’è ricostruzione');
});

test('ANC-READ-ANCORA-INVALIDA: un’ancora malformata non punisce la storia', () => {
  const storia = storiaChiusa();
  const giudizio = validaStoriaRipristinata(storia, { tipo: 'provider-state', schema: 'altro.schema.v9', versione: 1 });
  assert.equal(giudizio.esito, 'ancora-non-valida');
  assert.equal(giudizio.messaggi, storia);
});

test('ANC-READ-STORIA-ASSENTE: input non array ⇒ esito dedicato, mai un throw', () => {
  assert.equal(validaStoriaRipristinata(null, { tipo: 'provider-state' }).esito, 'storia-assente');
  assert.equal(validaStoriaRipristinata(undefined, null).esito, 'storia-assente');
});
