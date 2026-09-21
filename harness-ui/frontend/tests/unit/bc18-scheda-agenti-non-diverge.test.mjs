import test from 'node:test';
import assert from 'node:assert/strict';

import { schedaAgentiDaRileggere } from '../../src/components/inspector.js';

/*
 * ⛔⛔⛔ BC-18 (owner, 11/09/2026) — «la scheda AGENTI resta VUOTA mentre la sotto-attività è VIVA».
 *
 * LA FOTO DELL'OWNER: nella chat «1 attività in corso — Sotto-attività: Devi assemblare e validare
 * un file HTML… task: 4776 caratteri»; nella barra a sinistra la figlia C'È, annidata sotto la
 * madre, con «in corso · qwen3.8-flash»; nella colonna di destra, scheda Agenti: «Nessun
 * sotto-agente in questa sessione».
 *
 * RIPRODOTTO E MISURATO l'11/09 su un banco MIO (porta 4178 — mai la 4174 — con una COPIA dello
 * store dell'owner e il suo giro vero):
 *   · `GET /api/v1/sessions/8dde6bff…/children` risponde con UNA figlia: il server dice il vero.
 *     (La diagnosi iniziale diceva `[]`, ma chiedeva l'id di `37e10d21…`, che è la FIGLIA: a un
 *     figlio senza figli `[]` è la risposta giusta. Chiedere l'id sbagliato fa sembrare rotto il
 *     server che funziona.)
 *   · Con la figlia nata DOPO l'ultima lettura: barra 13 righe, figlia mostrata; scheda **0 card**,
 *     testo «Nessun sotto-agente in questa sessione» — e restava così a ogni giro successivo.
 *
 * CAUSA — non il dato, la CADENZA. Due viste della stessa verità, due orologi:
 *   · la barra rilegge `GET /api/v1/sessions` (che porta `padreId`) **ogni 15 s**;
 *   · la scheda rilegge `…/children` in tre soli momenti, e l'unico che cade mentre la delega VIVE
 *     è il `ToolCallStart` di `delega_sottotask` — l'istante in cui la figlia NON PUÒ ancora
 *     esistere. Misurato sul disco della sessione dell'owner (`8dde6bff….jsonl`): `ToolCallStart`
 *     è `_sequenza 33590`, e SOLO DOPO arrivano i `ToolCallArgs` che compitano a pezzi il task da
 *     4.776 caratteri (`{"task": `, `"Devi assembl`, `are e valid`, …). La figlia nasce quando
 *     l'ultimo pezzo è arrivato.
 *
 * ⇒ La cura non aggiunge un canale né un timer: l'elenco che la barra già rilegge fa da SVEGLIA,
 *   `…/children` resta la FONTE. Questa funzione è la decisione, e sta qui perché è l'unica parte
 *   che si può provare senza un server: il filo in `legacy/app.js` è una riga.
 *
 * ⛔ Ogni prova ha la sua gemella AL CONTRARIO, perché il modo di sbagliare questa cura è
 *   rileggere SEMPRE: una fetch ogni 15 secondi per sempre, e — peggio — far sparire card VERE
 *   quando lo snapshot è parziale, cioè BC-18 al rovescio.
 */

const MADRE = '8dde6bff-c463-4794-b6b9-7ddb4f5ce885';
const FIGLIA = '37e10d21-8e17-4376-9437-250424393936';
const SORELLA = 'cafe0000-0000-4000-8000-000000000001';
const ESTRANEA = 'beef0000-0000-4000-8000-000000000002';

/** Una riga di `GET /api/v1/sessions` ridotta ai campi che la decisione guarda. */
const riga = (sessionId, { padreId = null, conclusa = false, interrotta = false } = {}) => ({ sessionId, padreId, conclusa, interrotta });
/** Una riga di `…/children`: gli STESSI due campi di stato, verificato sul banco l'11/09. */
const card = (sessionId, { conclusa = false, interrotta = false } = {}) => ({ sessionId, conclusa, interrotta, taskCorto: 'qualcosa' });

test('BC-18 · IL CASO DEL BUG: la barra nomina una figlia che la scheda non mostra ⇒ si rilegge', () => {
  const elenco = [riga(MADRE), riga(FIGLIA, { padreId: MADRE }), riga(ESTRANEA)];
  assert.equal(
    schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [] }),
    true,
    '⛔ è esattamente la foto dell\'owner: la barra la disegna, la colonna dice «Nessun sotto-agente»',
  );
});

test('BC-18, AL CONTRARIO: le due viste d\'accordo NON fanno rileggere niente', () => {
  const elenco = [riga(MADRE), riga(FIGLIA, { padreId: MADRE })];
  assert.equal(
    schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [card(FIGLIA)] }),
    false,
    '⛔ senza questa, la cura diventa una fetch ogni 15 secondi per sempre: misurato sul banco, tre giri di fila = 0 letture in più',
  );
});

test('BC-18 · IL VERSO OPPOSTO DELLO STESSO DIFETTO: la figlia ha FINITO e la scheda la dice ancora viva', () => {
  /* È il difetto gemello dei concorrenti, e da loro è APERTO: openai/codex #38478 — «completed
     subagents remain shown as running/processing in the summary panel», per ore. Lo stato entra
     nell'impronta proprio per questo: non basta sapere CHI c'è, serve sapere se ha smesso. */
  const elenco = [riga(MADRE), riga(FIGLIA, { padreId: MADRE, conclusa: true })];
  assert.equal(schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [card(FIGLIA, { conclusa: false })] }), true);
  assert.equal(
    schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [card(FIGLIA, { conclusa: true })] }),
    false,
    'e quando la scheda si è già aggiornata, non si rilegge una seconda volta',
  );
});

test('BC-18 · una delega INTERROTTA dalla morte del processo è un cambio di stato come gli altri', () => {
  /* Il caso vero dello store dell'owner: `37e10d21…` esce `conclusa:false, interrotta:true` da
     TUTT'E DUE le rotte (verificato sul banco l'11/09). Se le due viste non fossero d'accordo su
     questo campo, il confronto troverebbe una differenza che non c'è e rileggerebbe per sempre. */
  const elenco = [riga(MADRE), riga(FIGLIA, { padreId: MADRE, interrotta: true })];
  assert.equal(schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [card(FIGLIA)] }), true, 'la scheda la crede ancora al lavoro');
  assert.equal(schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [card(FIGLIA, { interrotta: true })] }), false, 'e quando lo sa, si sta zitti');
});

test('BC-18 · una figlia SPARITA dall\'elenco non resta appesa nella scheda', () => {
  const elenco = [riga(MADRE)];
  assert.equal(
    schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [card(FIGLIA)] }),
    true,
    'la divergenza vale nei DUE versi: una card che nessuno conferma è una card da rileggere (codex #23930/#23931)',
  );
});

test('BC-18, AL CONTRARIO: le figlie di un\'ALTRA madre non riguardano questa scheda', () => {
  const elenco = [riga(MADRE), riga(ESTRANEA), riga(SORELLA, { padreId: ESTRANEA })];
  assert.equal(
    schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [] }),
    false,
    '⛔ senza il filtro su `padreId` ogni delega di chiunque farebbe rileggere la scheda di tutti',
  );
});

test('BC-18, AL CONTRARIO: senza una sessione aperta non c\'è niente da rileggere', () => {
  const elenco = [riga(MADRE), riga(FIGLIA, { padreId: MADRE })];
  assert.equal(schedaAgentiDaRileggere({ elenco, sessioneCorrente: null, figli: [] }), false);
  assert.equal(schedaAgentiDaRileggere({}), false, 'e una chiamata senza argomenti non deve lanciare: passa di qui a ogni giro dell\'elenco');
});

test('BC-18, AL CONTRARIO — LA GUARDIA CHE CONTA: uno snapshot che non nomina nemmeno la sessione aperta TACE', () => {
  /* Elenco filtrato, risposta parziale, sessione appena creata e non ancora nell'indice: quello
     snapshot non sa niente di questa madre. Senza questa guardia si rileggerebbe `…/children` per
     far SPARIRE card vere — cioè BC-18 al rovescio, con la foto giusta sostituita da quella
     sbagliata. */
  assert.equal(schedaAgentiDaRileggere({ elenco: [riga(ESTRANEA)], sessioneCorrente: MADRE, figli: [card(FIGLIA)] }), false);
  assert.equal(schedaAgentiDaRileggere({ elenco: [], sessioneCorrente: MADRE, figli: [card(FIGLIA)] }), false, 'un elenco vuoto è quasi sempre una fetch andata male, non un mondo senza sessioni');
});

test('BC-18, AL CONTRARIO: l\'ORDINE e i doppioni non sono una differenza', () => {
  const elenco = [riga(MADRE), riga(SORELLA, { padreId: MADRE }), riga(FIGLIA, { padreId: MADRE })];
  assert.equal(
    schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [card(FIGLIA), card(SORELLA)] }),
    false,
    'la barra ordina per avvio, la scheda pure, ma un riordino non è un fatto nuovo: si confrontano insiemi',
  );
  assert.equal(
    schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [card(FIGLIA)] }),
    true,
    'due sorelle e una sola card: qui la differenza è vera',
  );
});

test('BC-18 · righe malformate non fanno saltare il giro dell\'elenco', () => {
  /* Passa di qui ogni 15 secondi: se lancia, si porta dietro l\'aggiornamento della barra. */
  const elenco = [null, riga(MADRE), undefined, riga(FIGLIA, { padreId: MADRE })];
  assert.equal(schedaAgentiDaRileggere({ elenco, sessioneCorrente: MADRE, figli: [null, card(FIGLIA)] }), false);
  assert.equal(schedaAgentiDaRileggere({ elenco: 'non un elenco', sessioneCorrente: MADRE, figli: null }), false);
});
