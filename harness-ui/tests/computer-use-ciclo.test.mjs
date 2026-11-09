/*
 * Computer use, il ciclo del kernel — porte finte, ogni tetto e ogni ramo provati senza un PC vero.
 * Forma: CONTRATTI-COMPUTER-USE-V2-2026-11-01.md §2-§8; condizioni del Mobile (freno precondizione, mano a metà lotto, tetto per passo
 * fuori dal ciclo, orologio fermo mentre si aspetta la persona) e della CLI (eventi a codici).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eseguiCompito, EVENTI } from '../src/computer-use/ciclo.mjs';
import { PIENO_PRIMA_159 } from './computer-use-pieno-prima-159.mjs';
import { POLITICHE } from '../src/computer-use/protezioni.mjs';

// decisioni 156 e 159 (owner 04/11): queste prove usano Accesso pieno come rivelatore delle protezioni, con la tabella di prima;
// la tabella nuova del prodotto la fissano REV-R-25..27 (computer-use-revisione-r.test.mjs)
const PIENO = PIENO_PRIMA_159;
const NORMALE = POLITICHE.pcNormale;
const schermo = (over = {}) => ({ frenoArmato: true, elementi: [{ ref: 'b1', ruolo: 'pulsante', nome: 'Avanti' }, { ref: 'b2', ruolo: 'pulsante', nome: 'Acquista ora' }], dominio: 'negozio.example', ...over });

/** Porte finte: `risposte` è la sequenza di ciò che dice il modello; l'orologio avanza di `passoMs` a ogni lettura. */
function porte({ risposte = [], guarda = () => schermo(), agisci = () => ({ esito: 'confermata', modo: 'sottofondo' }), chiediPersona = () => 'si', ...altro } = {}) {
  let t = 0; let k = 0;
  const eventi = []; const eseguite = []; const domande = [];
  return {
    eventi, eseguite, domande,
    porte: {
      guarda: async () => guarda(),
      chiedi: async () => (k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }),
      agisci: async (azione, bersaglio) => { eseguite.push({ azione, bersaglio: bersaglio?.nome ?? null }); return agisci(azione, bersaglio); },
      bersaglio: (azione, s) => s.elementi.find((e) => e.ref === azione.ref) ?? null,
      chiediPersona: async (q) => { domande.push(q); return chiediPersona(q); },
      emetti: (nome, dati) => eventi.push({ nome, dati }),
      adesso: () => { t += altro.passoMs ?? 10; return t; },
      ...altro,
    },
  };
}

test('CICLO-01: un compito semplice finisce riuscito, gli eventi sono codici e l\'annuncio viene PRIMA dell\'azione', async () => {
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true, nota: 'fatto' } }] });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte });
  assert.equal(r.esito, 'riuscito'); assert.equal(r.motivo, 'completato'); assert.equal(p.eseguite.length, 1);
  const passi = p.eventi.filter((e) => e.nome === EVENTI.passo).map((e) => e.dati.fase);
  assert.deepEqual(passi, ['annuncio', 'esito']);
  for (const e of p.eventi) for (const v of Object.values(e.dati)) assert.ok(typeof v !== 'string' || v.length <= 120, 'niente frasi lunghe negli eventi');
});

test('CICLO-02: freno non armato ⇒ non si parte (condizione del Mobile)', async () => {
  const p = porte({ guarda: () => schermo({ frenoArmato: false }) });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'freno-non-armato'); assert.equal(p.eseguite.length, 0);
});

test('CICLO-03: la mano della persona ferma anche a metà lotto; il resto non si esegue', async () => {
  let azioniFatte = 0;
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }, { tipo: 'premi', ref: 'b1' }, { tipo: 'premi', ref: 'b1' }] }], fermato: () => (azioniFatte >= 1 ? 'mano-della-persona' : null), agisci: () => { azioniFatte += 1; return { esito: 'confermata' }; } });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'mano-della-persona'); assert.equal(p.eseguite.length, 1);
  assert.ok(r.storia.some((riga) => riga.includes('non-eseguita')));
  // la mano arriva MENTRE il modello pensa (fra la lettura dello schermo e la prima azione)
  let mano = null;
  const q = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }], fermato: () => mano });
  const chiediVero = q.porte.chiedi;
  q.porte.chiedi = async (...a) => { mano = 'mano-della-persona'; return chiediVero(...a); };
  const r2 = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: q.porte });
  assert.equal(r2.motivo, 'mano-della-persona'); assert.equal(q.eseguite.length, 0);
});

test('CICLO-04: tetti — passi, tempo, errori di fila, passo scaduto o vuoto (mai un\'eccezione muta)', async () => {
  const sempre = { azioni: [{ tipo: 'scorri', direzione: 'giu' }] };
  const passi = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: porte({ risposte: Array(50).fill(sempre) }).porte, limiti: { passi: 3 } });
  assert.equal(passi.motivo, 'tetto-passi'); assert.equal(passi.passi, 3);
  const tempo = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: porte({ risposte: Array(50).fill(sempre), passoMs: 1000 }).porte, limiti: { millisecondi: 5000 } });
  assert.equal(tempo.motivo, 'tetto-tempo');
  const vuote = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: porte({ risposte: [null, {}, null] }).porte });
  assert.equal(vuote.esito, 'non-riuscito'); assert.equal(vuote.motivo, 'errori-di-fila');
  const lento = porte(); lento.porte.chiedi = () => new Promise(() => {}); // il modello non risponde mai
  const scaduto = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: lento.porte, limiti: { msPerPasso: 20, msAnnullamento: 10 } });
  assert.equal(scaduto.motivo, 'errori-di-fila');
  const rotto = porte(); rotto.porte.chiedi = async () => { throw new Error('rete'); };
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: rotto.porte })).motivo, 'errori-di-fila');
  const falliti = porte({ risposte: Array(5).fill({ azioni: [{ tipo: 'premi', ref: 'b1' }] }), agisci: () => ({ esito: 'probabilmente-a-vuoto' }) });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: falliti.porte })).motivo, 'errori-di-fila');
  assert.equal(falliti.eseguite.length, 2, 'due tentativi poi stop (owner 10/08)');
});

test('CICLO-05: le protezioni valgono su ogni azione — pagamento non chiesto ferma, chiesto procede', async () => {
  const compra = { azioni: [{ tipo: 'premi', ref: 'b2' }] };
  const non = porte({ risposte: [compra] });
  const r1 = await eseguiCompito({ testoDellaPersona: 'trova il prezzo delle cuffie', politica: PIENO, porte: non.porte });
  assert.equal(r1.esito, 'fermato'); assert.equal(r1.motivo, 'protezione:pagamento'); assert.equal(non.eseguite.length, 0);
  assert.equal(r1.protezioni[0].decisione, 'ferma');
  const si = porte({ risposte: [compra, { fine: { riuscito: true } }] });
  const r2 = await eseguiCompito({ testoDellaPersona: 'compra le cuffie più economiche', politica: PIENO, porte: si.porte });
  assert.equal(r2.esito, 'riuscito'); assert.equal(si.eseguite.length, 1);
});

test('CICLO-06: «chiedi» ferma l\'orologio mentre la persona decide; un no diventa «rifiutata» e il modello cambia strada', async () => {
  let t = 0;
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b2' }, { tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true } }], chiediPersona: () => { t += 1_000_000; return 'no'; } });
  p.porte.adesso = () => { t += 10; return t; };
  const r = await eseguiCompito({ testoDellaPersona: 'compra le cuffie', politica: NORMALE, porte: p.porte, limiti: { millisecondi: 60_000 } });
  assert.equal(r.esito, 'riuscito', 'l\'attesa della persona non consuma il tetto di tempo');
  assert.equal(p.eseguite.length, 0); assert.ok(r.storia.some((riga) => riga.includes('rifiutata (protezione)')));
  assert.equal(p.domande[0].protezione, 'pagamento');
});

test('CICLO-07: riscrivi esegue l\'azione sostitutiva (Shift+Canc → Canc); scegli-riservato usa la porta dedicata', async () => {
  const p = porte({ risposte: [{ azioni: [{ tipo: 'tasti', combinazione: 'shift+delete' }] }, { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'elimina le foto vecchie', politica: PIENO, porte: p.porte });
  assert.deepEqual(p.eseguite[0].azione, { tipo: 'tasti', combinazione: 'delete' });
  const banner = schermo({ elementi: [{ ref: 'c', ruolo: 'pulsante', nome: 'Accetta tutti i cookie' }] });
  let riservato = 0;
  const q = porte({ guarda: () => banner, risposte: [{ azioni: [{ tipo: 'premi', ref: 'c' }] }, { fine: { riuscito: true } }], scegliRiservato: async () => { riservato += 1; return { esito: 'confermata' }; } });
  const r = await eseguiCompito({ testoDellaPersona: 'apri il sito', politica: PIENO, porte: q.porte });
  assert.equal(riservato, 1); assert.equal(q.eseguite.length, 0, '«Accetta tutto» non si preme mai'); assert.equal(r.esito, 'riuscito');
});

test('CICLO-08: pausa (schermo bloccato) — ripresa o fermata; chiedi_persona; sospetto appiccicoso; impossibile; conferma obiettivo', async () => {
  let giro = 0;
  const pausa = porte({ guarda: () => (giro++ === 0 ? schermo({ pausa: 'schermo-bloccato' }) : schermo()), attendiRipresa: async () => true });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: pausa.porte })).esito, 'riuscito');
  assert.ok(pausa.eventi.some((e) => e.nome === EVENTI.pausa));
  const ferma = porte({ guarda: () => schermo({ pausa: 'uac' }), attendiRipresa: async () => false });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: ferma.porte })).motivo, 'tetto-tempo');
  const annulla = porte({ risposte: [{ azioni: [{ tipo: 'chiedi_persona', motivo: 'accesso' }] }], chiediPersona: () => 'annulla' });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: annulla.porte })).motivo, 'pulsante-ferma');
  // il sospetto resta per tutto il compito: un pagamento chiesto si ferma lo stesso
  let g = 0;
  const sosp = porte({ guarda: () => schermo(g++ === 0 ? { sospetto: 'istruzioni-nella-pagina' } : {}), risposte: [{ azioni: [{ tipo: 'scorri' }] }, { azioni: [{ tipo: 'premi', ref: 'b2' }] }] });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'compra le cuffie', politica: PIENO, porte: sosp.porte })).motivo, 'protezione:pagamento');
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: porte({ risposte: [{ fine: { impossibile: true } }] }).porte })).motivo, 'impossibile');
  const smentito = porte({ risposte: [{ fine: { riuscito: true } }], confermaObiettivo: async () => false });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: smentito.porte });
  assert.equal(r.esito, 'non-riuscito'); assert.equal(r.verificato, false);
});

test('CICLO-09: aiutante assente, lotto interrotto dal cambio di finestra, azione non valutabile', async () => {
  const assente = porte({ guarda: () => null });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: assente.porte })).esito, 'assente');
  const cambio = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }, { tipo: 'premi', ref: 'b1' }] }], agisci: () => ({ esito: 'confermata', cambiato: true }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: cambio.porte });
  assert.equal(cambio.eseguite.length, 1, 'dopo un cambio di finestra si rilegge lo schermo');
  const strano = porte({ risposte: [{ azioni: [{ tipo: 'click', ref: 'b1' }] }] });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: strano.porte });
  assert.equal(r.motivo, 'protezione:non-valutabile'); assert.equal(strano.eseguite.length, 0);
});

// ---------- revisione avversaria del Mobile (02/11 notte) ----------
test('CICLO-10: un\'azione scaduta si annulla; se non conferma, il compito si ferma e nessun\'altra azione parte (S1-1)', async () => {
  let chiamate = 0; const segnali = [];
  const p = porte({ risposte: Array(5).fill({ azioni: [{ tipo: 'premi', ref: 'b1' }, { tipo: 'premi', ref: 'b1' }] }) });
  p.porte.agisci = (azione, bersaglio, segnale) => { chiamate += 1; segnali.push(segnale); return new Promise(() => {}); }; // non si ferma mai
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte, limiti: { msPerPasso: 20, msAnnullamento: 10 } });
  assert.equal(r.esito, 'fermato'); assert.equal(r.motivo, 'tempo'); assert.equal(chiamate, 1, 'mai due mani sullo schermo');
  assert.equal(segnali[0].aborted, true, 'il segnale di annullamento è arrivato');
  // un'azione che RISPETTA l'annullamento conta come fallimento e il ciclo può continuare
  const q = porte({ risposte: Array(5).fill({ azioni: [{ tipo: 'premi', ref: 'b1' }] }) });
  q.porte.agisci = (azione, bersaglio, segnale) => new Promise((ok) => { segnale.addEventListener('abort', () => ok({ esito: 'rifiutata', motivo: 'annullata' })); });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: q.porte, limiti: { msPerPasso: 20, msAnnullamento: 50 } })).motivo, 'errori-di-fila');
});

test('CICLO-11: ogni porta che lancia esce con un evento di fine, mai muta (S1-2)', async () => {
  const lancia = () => { throw new Error('guasto'); };
  const casi = [
    ['bersaglio', schermo(), PIENO, 'x'],
    ['chiediPersona', schermo(), NORMALE, 'compra'],
    ['scegliRiservato', schermo({ elementi: [{ ref: 'b1', ruolo: 'pulsante', nome: 'Accetta tutti i cookie' }] }), PIENO, 'x'],
    ['attendiRipresa', schermo({ pausa: 'uac' }), PIENO, 'x'],
    ['guarda', schermo(), PIENO, 'x'],
    ['emetti', schermo(), PIENO, 'x'],
  ];
  for (const [nome, schermata, politica, testo] of casi) {
    const ref = nome === 'chiediPersona' ? 'b2' : 'b1';
    const p = porte({ guarda: () => schermata, risposte: [{ azioni: [{ tipo: 'premi', ref }] }] });
    const eventi = [];
    if (nome !== 'emetti') p.porte.emetti = (n, d) => eventi.push({ n, d });
    p.porte[nome] = lancia;
    const r = await eseguiCompito({ testoDellaPersona: testo, politica, porte: p.porte });
    // un evento perso non ferma il ciclo: con `emetti` che lancia il compito finisce lo stesso
    assert.ok((nome === 'emetti' ? ['riuscito'] : ['non-riuscito', 'fermato', 'assente']).includes(r.esito), `${nome}: ${r.esito}`);
    if (nome !== 'emetti') assert.ok(eventi.some((e) => e.n === EVENTI.esito || e.n === EVENTI.fermato), `evento di fine con ${nome} che lancia`);
  }
});

test('CICLO-12: dopo il sì della persona si rilegge: bersaglio cambiato ⇒ niente azione (S1-3)', async () => {
  let cambiato = false;
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b2' }] }, { fine: { riuscito: true } }],
    guarda: () => (cambiato ? schermo({ elementi: [{ ref: 'b2', ruolo: 'pulsante', nome: 'Elimina account' }] }) : schermo()),
    chiediPersona: () => { cambiato = true; return 'si'; } });
  const r = await eseguiCompito({ testoDellaPersona: 'compra le cuffie', politica: NORMALE, porte: p.porte });
  assert.equal(p.eseguite.length, 0, 'il sì era per «Acquista ora», non per quello che c\'è adesso');
  assert.ok(r.storia.some((riga) => riga.includes('elemento-sparito')));
  // V1: il sì era per un INVIO; nel frattempo la pagina è diventata una cassa: il pagamento non passa con quel sì
  let cassa = false;
  const invio = schermo({ elementi: [{ ref: 'b3', ruolo: 'pulsante', nome: 'Invia' }] });
  const conCassa = schermo({ elementi: [{ ref: 'b3', ruolo: 'pulsante', nome: 'Invia' }, { ruolo: 'campo', nome: 'Numero carta', segnali: { autocomplete: 'cc-number' } }] });
  const q = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b3' }] }, { fine: { riuscito: true } }], guarda: () => (cassa ? conCassa : invio), chiediPersona: () => { cassa = true; return 'si'; } });
  const r2 = await eseguiCompito({ testoDellaPersona: 'scrivi a Marco', politica: NORMALE, porte: q.porte });
  assert.equal(q.eseguite.length, 0); assert.ok(r2.storia.some((riga) => riga.includes('protezione-cambiata')));
});

test('CICLO-13: nel lotto la seconda azione vede la modale aperta dalla prima; il freno perso a metà lotto ferma (S1-4, S2-2)', async () => {
  let aperta = false;
  const modale = schermo({ elementi: [{ ref: 'd', ruolo: 'finestra', nome: 'Questa operazione non si può annullare', modale: true }, { ref: 'ok', ruolo: 'pulsante', nome: 'OK', finestra: 'd' }] });
  const p = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }, { tipo: 'premi', ref: 'ok' }] }],
    guarda: () => (aperta ? modale : schermo()), agisci: () => { aperta = true; return { esito: 'confermata' }; } });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: p.porte });
  assert.equal(p.eseguite.length, 1); assert.equal(r.motivo, 'protezione:cancellazione');
  let fatte = 0;
  const q = porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'b1' }, { tipo: 'premi', ref: 'b1' }] }], guarda: () => schermo({ frenoArmato: fatte === 0 }), agisci: () => { fatte += 1; return { esito: 'confermata' }; } });
  const r2 = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: q.porte });
  assert.equal(r2.motivo, 'freno-perso'); assert.equal(fatte, 1);
});

test('CICLO-14: tetto alle azioni per lotto e al tempo dentro il lotto (S2-1)', async () => {
  const lungo = { azioni: Array(50).fill({ tipo: 'premi', ref: 'b1' }) };
  const p = porte({ risposte: [lungo, { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
  assert.equal(p.eseguite.length, 10);
  const q = porte({ risposte: [lungo], passoMs: 1000 });
  const r = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: q.porte, limiti: { millisecondi: 8000 } });
  assert.equal(r.motivo, 'tetto-tempo'); assert.ok(q.eseguite.length < 10);
});

test('CICLO-15: l\'evento d\'esito porta «verificato» e i campi di Performance (S2-3, S3)', async () => {
  const p = porte({ risposte: [{ fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: p.porte });
  const esito = p.eventi.find((e) => e.nome === EVENTI.esito).dati;
  assert.ok(Object.hasOwn(esito, 'verificato')); assert.equal(esito.verificato, null);
  for (const k of ['richieste', 'catture', 'azioni', 'azioniFallite', 'azioniRitentate', 'msModello', 'msAiutante', 'msAttesa', 'tokenIngresso', 'tokenUscita']) assert.ok(Object.hasOwn(esito, k), k);
  const senza = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: porte({ risposte: [{ fine: { riuscito: false } }] }).porte });
  assert.equal(senza.motivo, 'senza-esito');
});

test('CICLO-16: guardia degli ordinali del telefono (S2-4); due «no» alla stessa azione fermano (S3)', async () => {
  const lista = schermo({ elementi: [{ ref: 'c1', ruolo: 'voce', nome: 'Anna', inLista: 'l1' }, { ref: 'c2', ruolo: 'voce', nome: 'Bruno', inLista: 'l1' }, { ref: 'c3', ruolo: 'voce', nome: 'Carla', inLista: 'l1' }] });
  const p = porte({ guarda: () => lista, risposte: [{ azioni: [{ tipo: 'premi', ref: 'c2' }] }, { azioni: [{ tipo: 'premi', ref: 'c1' }] }, { fine: { riuscito: true } }] });
  const r = await eseguiCompito({ testoDellaPersona: 'apri il primo contatto', politica: PIENO, porte: p.porte });
  assert.deepEqual(p.eseguite.map((e) => e.bersaglio), ['Anna']); assert.ok(r.storia.some((riga) => riga.includes('ordinale-sbagliato')));
  const quantita = porte({ guarda: () => lista, risposte: [{ azioni: [{ tipo: 'premi', ref: 'c3' }] }, { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'compra 2 biglietti per Carla', politica: PIENO, porte: quantita.porte });
  assert.equal(quantita.eseguite.length, 1, 'una quantità non è un ordinale');
  // V2: contenitore e figlio con lo stesso nome non sono un ordinale sbagliato; V3: dopo il primo rispettato l'ordinale si spegne
  const doppio = schermo({ elementi: [{ ref: 'riga1', ruolo: 'voce', nome: 'Anna', inLista: 'l1' }, { ref: 'testo1', ruolo: 'testo', nome: 'Anna', inLista: 'l1' }, { ref: 'c2', ruolo: 'voce', nome: 'Bruno', inLista: 'l1' }, { ref: 'm3', ruolo: 'voce', nome: 'Messaggio tre', inLista: 'l2' }] });
  const v2 = porte({ guarda: () => doppio, risposte: [{ azioni: [{ tipo: 'premi', ref: 'testo1' }] }, { azioni: [{ tipo: 'premi', ref: 'm3' }] }, { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'apri il primo contatto', politica: PIENO, porte: v2.porte });
  assert.deepEqual(v2.eseguite.map((e) => e.bersaglio), ['Anna', 'Messaggio tre']);
  const insiste = porte({ risposte: Array(5).fill({ azioni: [{ tipo: 'premi', ref: 'b2' }] }), chiediPersona: () => 'no' });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: insiste.porte })).motivo, 'rifiutata-dalla-persona');
});

// ---------- riga «Posso» nel ciclo (owner 02/11; forma FORMA-RIGA-POSSO-NEL-CICLO-2026-11-02.md, condizioni di Desktop, Frontend, Mobile) ----------
const compra = { azioni: [{ tipo: 'premi', ref: 'b2' }] };
const datiFermato = (p) => p.eventi.find((e) => e.nome === EVENTI.fermato)?.dati;
const campoPw = () => schermo({ elementi: [{ ref: 'p1', ruolo: 'campo', nome: 'Password', segnali: { isPassword: true } }] });
const scriviPw = { azioni: [{ tipo: 'scrivi', ref: 'p1', testo: 'inventata123' }] };

test('CICLO-17: «causa» dell\'arresto — non-chiesto, sospetto (che vince), politica; null e sempre presente per tutto il resto', async () => {
  const nonChiesto = porte({ risposte: [compra] });
  const a = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: nonChiesto.porte });
  assert.deepEqual([a.motivo, a.causa, datiFermato(nonChiesto).causa], ['protezione:pagamento', 'non-chiesto', 'non-chiesto']);
  let g = 0;
  const sosp = porte({ guarda: () => schermo(g++ === 0 ? { sospetto: 'istruzioni-nella-pagina' } : {}), risposte: [{ azioni: [{ tipo: 'scorri' }] }, compra] });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: sosp.porte })).causa, 'sospetto', 'il sospetto vince anche se l\'intenzione manca');
  const sosp2 = porte({ guarda: () => schermo({ sospetto: 'x' }), risposte: [compra] });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'compra il biglietto', politica: PIENO, porte: sosp2.porte })).causa, 'sospetto');
  const tel = porte({ risposte: [compra] });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'compra il biglietto', politica: POLITICHE.telefono, porte: tel.porte })).causa, 'politica', 'chiesto ma la politica non lo consente');
  // null, ma presente, per ogni altro arresto e per l'esito (condizione b del Desktop)
  const freno = porte({ guarda: () => schermo({ frenoArmato: false }) });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: freno.porte });
  assert.ok(Object.hasOwn(datiFermato(freno), 'causa')); assert.equal(datiFermato(freno).causa, null);
  const pw = porte({ guarda: campoPw, risposte: [scriviPw] });
  const rpw = await eseguiCompito({ testoDellaPersona: 'entra', politica: PIENO, porte: pw.porte });
  assert.deepEqual([rpw.motivo, rpw.causa], ['protezione:credenziale', null]);
  const ok = porte({ risposte: [{ fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: ok.porte });
  const esito = ok.eventi.find((e) => e.nome === EVENTI.esito).dati;
  assert.ok(Object.hasOwn(esito, 'causa')); assert.equal(esito.causa, null);
});

test('CICLO-18: la riga cambia i permessi a metà compito — solo «=== true», porta che lancia toglie tutto, evento «permessi» nella traccia', async () => {
  let riga = { pagare: false, inviare: false, cancellare: false };
  const tolto = porte({ risposte: [compra], richiestaAggiornata: () => riga });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'compra il biglietto', politica: PIENO, porte: tolto.porte })).causa, 'non-chiesto', 'voce spenta: non paga');
  const ev = tolto.eventi.find((e) => e.nome === EVENTI.permessi)?.dati;
  assert.deepEqual([ev?.prima.pagare, ev?.dopo.pagare], [true, false]);
  riga = { pagare: 'true', inviare: 1, cancellare: {} };
  const finti = porte({ risposte: [compra], richiestaAggiornata: () => riga });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: finti.porte })).causa, 'non-chiesto', 'solo il booleano vero sblocca');
  const acceso = porte({ risposte: [compra, { fine: { riuscito: true } }], richiestaAggiornata: () => ({ pagare: true, inviare: false, cancellare: false }) });
  const r = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: acceso.porte });
  assert.equal(r.esito, 'riuscito'); assert.equal(acceso.eseguite.length, 1);
  const iPermessi = acceso.eventi.findIndex((e) => e.nome === EVENTI.permessi);
  const iAnnuncio = acceso.eventi.findIndex((e) => e.nome === EVENTI.passo && e.dati.fase === 'annuncio');
  assert.ok(iPermessi >= 0 && iPermessi < iAnnuncio, 'l\'evento dei permessi viene PRIMA dell\'azione di pagamento');
  assert.deepEqual([acceso.eventi[iPermessi].dati.prima.pagare, acceso.eventi[iPermessi].dati.dopo.pagare], [false, true]);
  const lancia = porte({ risposte: [compra], richiestaAggiornata: () => { throw new Error('rotta'); } });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'compra il biglietto', politica: PIENO, porte: lancia.porte })).causa, 'non-chiesto', 'porta rotta: nessun permesso');
  const senzaRiga = porte({ risposte: [compra, { fine: { riuscito: true } }], richiestaAggiornata: () => undefined });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'compra il biglietto', politica: PIENO, porte: senzaRiga.porte })).esito, 'riuscito', 'senza riga valgono le parole');
  assert.equal(senzaRiga.eventi.some((e) => e.nome === EVENTI.permessi), false, 'senza riga, nessun evento');
  const uguale = porte({ risposte: [compra, { fine: { riuscito: true } }], richiestaAggiornata: () => ({ pagare: true, inviare: false, cancellare: false }) });
  await eseguiCompito({ testoDellaPersona: 'compra il biglietto', politica: PIENO, porte: uguale.porte });
  assert.equal(uguale.eventi.some((e) => e.nome === EVENTI.permessi), false, 'riga uguale alla frase: nessun cambio, nessun evento');
  const sospAcceso = porte({ guarda: () => schermo({ sospetto: 'x' }), risposte: [compra], richiestaAggiornata: () => ({ pagare: true }) });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: sospAcceso.porte })).causa, 'sospetto', 'la riga non spegne il sospetto');
});

test('CICLO-19: fermo alla cassa — «aggiunto» riparte, «riprendi» due volte chiude, «fallo-tu», «annulla»; il sospetto richiede ma non all\'infinito', async () => {
  let riga = { pagare: false, inviare: false, cancellare: false };
  const domande = [];
  const aggiunto = porte({ risposte: [compra, { fine: { riuscito: true } }], richiestaAggiornata: () => riga,
    permessoMancante: async (d) => { domande.push(d); riga = { ...riga, pagare: true }; return 'aggiunto'; } });
  const r = await eseguiCompito({ testoDellaPersona: 'cerca il treno', politica: PIENO, porte: aggiunto.porte });
  assert.equal(r.esito, 'riuscito'); assert.equal(aggiunto.eseguite.length, 1);
  assert.deepEqual(domande, [{ azione: 'premi', protezione: 'pagamento', causa: 'non-chiesto' }]);
  assert.ok(aggiunto.eventi.some((e) => e.nome === EVENTI.pausa && e.dati.motivo === 'permesso:pagamento' && e.dati.causa === 'non-chiesto'));
  assert.ok(r.storia.some((x) => x.includes('acceso il permesso')), 'la storia dice che ha permesso la persona');
  // il sospetto arriva MENTRE si aspetta la persona: dopo «aggiunto» si rilegge lo schermo e non si paga
  let letture = 0; let rigaS = { pagare: false };
  const dS = [];
  const tardivo = porte({ guarda: () => schermo(letture++ >= 1 ? { sospetto: 'arrivato-dopo' } : {}), risposte: [compra], richiestaAggiornata: () => rigaS,
    permessoMancante: async (d) => { dS.push(d.causa); rigaS = { pagare: true }; return dS.length < 2 ? 'aggiunto' : 'annulla'; } });
  await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: tardivo.porte });
  assert.deepEqual([dS, tardivo.eseguite.length], [['non-chiesto', 'sospetto'], 0]);
  // il pulsante cambia mentre si aspetta: niente azione su un elemento diverso
  let l2 = 0; let rigaE = { pagare: false };
  const cambiato = porte({ guarda: () => (l2++ >= 1 ? schermo({ elementi: [{ ref: 'b2', ruolo: 'pulsante', nome: 'Elimina account' }] }) : schermo()),
    risposte: [compra, { fine: { riuscito: true } }], richiestaAggiornata: () => rigaE, permessoMancante: async () => { rigaE = { pagare: true }; return 'aggiunto'; } });
  const rc = await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: cambiato.porte });
  assert.equal(cambiato.eseguite.length, 0); assert.ok(rc.storia.some((x) => x.includes('elemento-sparito')));
  // col sospetto «aggiunto» non basta: si richiede con causa «sospetto», al massimo tre volte, poi si chiude
  const dSosp = [];
  const sosp = porte({ guarda: () => schermo({ sospetto: 'x' }), risposte: [compra], richiestaAggiornata: () => ({ pagare: true }),
    permessoMancante: async (d) => { dSosp.push(d.causa); return 'aggiunto'; } });
  const rs = await eseguiCompito({ testoDellaPersona: 'vai avanti', politica: PIENO, porte: sosp.porte });
  assert.deepEqual([rs.motivo, rs.causa, sosp.eseguite.length], ['protezione:pagamento', 'sospetto', 0]);
  assert.deepEqual(dSosp, ['sospetto', 'sospetto', 'sospetto']);
  const riprendi = porte({ risposte: Array(4).fill(compra), permessoMancante: async () => 'riprendi' });
  const rr = await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: riprendi.porte });
  assert.deepEqual([rr.motivo, riprendi.eseguite.length], ['rifiutata-dalla-persona', 0]);
  assert.ok(rr.storia.some((x) => x.includes('rifiutata-dalla-persona')));
  const unaVolta = porte({ risposte: [compra, { fine: { riuscito: true } }], permessoMancante: async () => 'riprendi' });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: unaVolta.porte })).esito, 'riuscito', 'riprendi: si continua senza');
  const tu = await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: porte({ risposte: [compra], permessoMancante: async () => 'fallo-tu' }).porte });
  assert.deepEqual([tu.motivo, tu.causa], ['mano-della-persona', 'non-chiesto']);
  for (const risp of ['annulla', 'boh', undefined]) {
    const x = await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: porte({ risposte: [compra], permessoMancante: async () => risp }).porte });
    assert.equal(x.motivo, 'pulsante-ferma', String(risp));
  }
  const rotta = await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: porte({ risposte: [compra], permessoMancante: async () => { throw new Error('x'); } }).porte });
  // revisione del passo 5, difetto 2 (04/11/2026): una porta che lancia non sblocca, e il motivo è il suo, mai lo Stop della persona
  assert.deepEqual([rotta.esito, rotta.motivo], ['fermato', 'domanda-non-mostrata'], 'una porta che lancia non sblocca');
  // le protezioni che la riga non governa non chiamano la porta
  let chiamate = 0;
  const pw = porte({ guarda: campoPw, risposte: [scriviPw], permessoMancante: async () => { chiamate += 1; return 'aggiunto'; } });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'entra', politica: PIENO, porte: pw.porte })).motivo, 'protezione:credenziale');
  assert.equal(chiamate, 0);
});

// ---------- tagli del censimento delle interruzioni (regola 17 dell'owner, 02/11) ----------
const cassa = (importo = '10,00 €', over = {}) => schermo({ titolo: 'Cassa - Negozio', elementi: [{ ref: 'tot', ruolo: 'testo', nome: `Totale ${importo}` }, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }, { ref: 'conf', ruolo: 'pulsante', nome: 'Conferma pagamento' }], ...over });
const premi = (ref) => ({ azioni: [{ tipo: 'premi', ref }] });

test('CICLO-21: un sì vale per UNA operazione (T2, condizioni del Mobile): stessa protezione, pagina, importo; si consuma; il sospetto lo revoca', async () => {
  // «Paga ora» poi «Conferma pagamento» sulla stessa pagina ⇒ UNA domanda, e l'esito elenca le azioni fatte sotto quel sì
  const una = porte({ guarda: () => cassa(), risposte: [premi('paga'), premi('conf'), { fine: { riuscito: true } }] });
  const r1 = await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: una.porte });
  assert.deepEqual([r1.esito, una.domande.length, una.eseguite.length], ['riuscito', 1, 2]);
  assert.deepEqual(r1.conferme, [{ passo: 1, protezione: 'pagamento', azioni: ['premi', 'premi'] }]);
  assert.ok(r1.storia.some((x) => x.includes('vale il sì del passo 1')));
  assert.deepEqual(una.eventi.find((e) => e.nome === EVENTI.esito).dati.conferme, r1.conferme, 'anche nell\'evento d\'esito');
  // due pagamenti nello stesso compito sullo stesso sito ⇒ due domande: il primo, riuscito, ha cambiato la finestra e chiuso l'operazione
  const due = porte({ guarda: () => cassa(), risposte: [premi('paga'), premi('paga'), { fine: { riuscito: true } }], agisci: () => ({ esito: 'confermata', cambiato: true }) });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: due.porte });
  assert.equal(due.domande.length, 2);
  // importo cambiato fra i due ⇒ nuova domanda
  let importo = '10,00 €';
  const cambia = porte({ guarda: () => cassa(importo), risposte: [premi('paga'), premi('conf'), { fine: { riuscito: true } }], agisci: () => { importo = '1.000,00 €'; return { esito: 'confermata' }; } });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: cambia.porte });
  assert.equal(cambia.domande.length, 2);
  // invio a Marco poi a Luca nella stessa app ⇒ due domande; due messaggi a Marco ⇒ una
  // stesso titolo di pagina per tutte le chat (come molte app): il destinatario si legge dalla testata (Mobile)
  let chat = 'Marco';
  const app = () => schermo({ dominio: 'web.whatsapp.com', titolo: 'WhatsApp', elementi: [{ ref: 'h', ruolo: 'intestazione', nome: chat }, { ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }] });
  const dueChat = porte({ guarda: app, risposte: [premi('inv'), premi('inv'), { fine: { riuscito: true } }], agisci: () => { chat = 'Luca'; return { esito: 'confermata' }; } });
  await eseguiCompito({ testoDellaPersona: 'scrivi', politica: NORMALE, porte: dueChat.porte });
  assert.equal(dueChat.domande.length, 2);
  chat = 'Marco';
  const stessa = porte({ guarda: app, risposte: [premi('inv'), premi('inv'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'scrivi', politica: NORMALE, porte: stessa.porte });
  assert.equal(stessa.domande.length, 1);
  // destinatario che non si legge (nessuna testata, nessuna conversazione) ⇒ ogni invio chiede
  const cieca = porte({ guarda: () => schermo({ dominio: 'web.whatsapp.com', titolo: 'WhatsApp', elementi: [{ ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }] }), risposte: [premi('inv'), premi('inv'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'scrivi', politica: NORMALE, porte: cieca.porte });
  assert.equal(cieca.domande.length, 2);
  // la conversazione dichiarata dallo schermo vale come la testata
  const dich = porte({ guarda: () => schermo({ dominio: 'web.whatsapp.com', titolo: 'WhatsApp', conversazione: 'Marco', elementi: [{ ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }] }), risposte: [premi('inv'), premi('inv'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'scrivi', politica: NORMALE, porte: dich.porte });
  assert.equal(dich.domande.length, 1);
  // un sospetto acceso dopo il sì revoca il sì
  let sosp = false;
  const revoca = porte({ guarda: () => cassa('10,00 €', sosp ? { sospetto: 'istruzioni-nella-pagina' } : {}), risposte: [premi('paga'), premi('conf'), { fine: { riuscito: true } }], agisci: () => { sosp = true; return { esito: 'confermata' }; } });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: revoca.porte });
  assert.equal(revoca.domande.length, 2);
  // lasciare la pagina chiude l'operazione, anche se poi si torna
  let titolo = 'Cassa - Negozio';
  const torna = porte({ guarda: () => cassa('10,00 €', { titolo }), risposte: [premi('paga'), { azioni: [{ tipo: 'scorri' }] }, premi('conf'), { fine: { riuscito: true } }],
    agisci: (a) => { titolo = a.tipo === 'scorri' ? 'Cassa - Negozio' : 'Altra pagina'; return { esito: 'confermata' }; } });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: torna.porte });
  assert.equal(torna.domande.length, 2);
  // senza titolo (pagina sconosciuta) un sì non vale mai per l'azione dopo
  const senza = porte({ guarda: () => cassa('10,00 €', { titolo: undefined }), risposte: [premi('paga'), premi('conf'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: senza.porte });
  assert.equal(senza.domande.length, 2);
  // un'altra origine con lo stesso titolo: chiede di nuovo
  let dom = 'negozio.example';
  const altrove = porte({ guarda: () => cassa('10,00 €', { dominio: dom }), risposte: [premi('paga'), premi('conf'), { fine: { riuscito: true } }], agisci: () => { dom = 'negozio-falso.example'; return { esito: 'confermata' }; } });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: altrove.porte });
  assert.equal(altrove.domande.length, 2);
  // senza origine (né dominio né app) un sì non vale mai per l'azione dopo
  const senzaOrigine = porte({ guarda: () => cassa('10,00 €', { dominio: undefined }), risposte: [premi('paga'), premi('conf'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: senzaOrigine.porte });
  assert.equal(senzaOrigine.domande.length, 2);
  // stessa protezione ma motivo diverso (password, poi la carta salvata del browser) sulla stessa pagina: chiede di nuovo
  const login = () => schermo({ titolo: 'Accesso - Negozio', elementi: [{ ref: 'pw', ruolo: 'campo', nome: 'Password', segnali: { isPassword: true } }, { ref: 'cc', ruolo: 'voce', nome: 'Visa •••• 4242' }] });
  const motivi = porte({ guarda: login, risposte: [{ azioni: [{ tipo: 'scrivi', ref: 'pw', testo: 'inventata123' }] }, premi('cc'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'entra', politica: NORMALE, porte: motivi.porte });
  assert.equal(motivi.domande.length, 2);
});

test('CICLO-23: il sì del pagamento passa solo dal pulsante che avvia alla conferma dello stesso importo letto, una volta; la cancellazione chiede sempre (S2 del Desktop)', async () => {
  const vetrina = (conImporto) => schermo({ titolo: 'Negozio', elementi: [
    { ref: 'c1', ruolo: 'pulsante', nome: conImporto ? 'Compra ora 9,99 €' : 'Compra ora' }, { ref: 'c2', ruolo: 'pulsante', nome: conImporto ? 'Compra ora 9,99 €' : 'Compra ora' }] });
  // la prova rossa della revisione: due «Compra ora» senza importo sulla stessa pagina ⇒ due domande
  const senza = porte({ guarda: () => vetrina(false), risposte: [premi('c1'), premi('c2'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: senza.porte });
  assert.equal(senza.domande.length, 2);
  // anche con l'importo: un secondo pulsante che AVVIA è un acquisto nuovo
  const con = porte({ guarda: () => vetrina(true), risposte: [premi('c1'), premi('c2'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: con.porte });
  assert.equal(con.domande.length, 2);
  // «Paga ora» → «Conferma pagamento» senza importo leggibile ⇒ due domande
  const muta = porte({ guarda: () => cassa('10,00 €', { elementi: [{ ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }, { ref: 'conf', ruolo: 'pulsante', nome: 'Conferma pagamento' }] }),
    risposte: [premi('paga'), premi('conf'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: muta.porte });
  assert.equal(muta.domande.length, 2);
  // la conferma spende il sì: una seconda conferma chiede
  const dueConferme = porte({ guarda: () => cassa(), risposte: [premi('paga'), premi('conf'), premi('conf'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: dueConferme.porte });
  assert.equal(dueConferme.domande.length, 2);
  // un pulsante che conferma E avvia («Conferma e paga») vale come un acquisto nuovo, nel verso sicuro
  const misto = porte({ guarda: () => cassa('10,00 €', { elementi: [{ ref: 'tot', ruolo: 'testo', nome: 'Totale 10,00 €' }, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }, { ref: 'cp', ruolo: 'pulsante', nome: 'Conferma e paga' }] }),
    risposte: [premi('paga'), premi('cp'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'compra', politica: NORMALE, porte: misto.porte });
  assert.equal(misto.domande.length, 2);
  // cancellazione: ogni volta
  const cartella = () => schermo({ titolo: 'Documenti', dominio: 'drive.example', elementi: [{ ref: 'e1', ruolo: 'pulsante', nome: 'Elimina definitivamente' }] });
  const canc = porte({ guarda: cartella, risposte: [premi('e1'), premi('e1'), { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'pulisci', politica: NORMALE, porte: canc.porte });
  assert.equal(canc.domande.length, 2);
});

test('CICLO-24: niente foto mentre la persona fa da sé (confronto UI/UX, riga 5): ogni attesa è annunciata prima e nessuna cattura fino alla risposta', { timeout: 5_000 }, async () => {
  // registro in ordine: eventi del ciclo, catture, inizio e fine di ogni attesa della persona
  const giro = async ({ guarda, risposte, politica = PIENO, testo = 'x', ...porteExtra }) => {
    const log = [];
    let inAttesa = false;
    const attesa = (fn) => async (...a) => { log.push('attesa:inizio'); inAttesa = true; await new Promise((ok) => setTimeout(ok, 5)); const r = await fn(...a); inAttesa = false; log.push('attesa:fine'); return r; };
    const p = porte({ guarda, risposte, ...Object.fromEntries(Object.entries(porteExtra).map(([k, f]) => [k, attesa(f)])) });
    const guardaVera = p.porte.guarda;
    p.porte.guarda = async (...a) => { log.push(inAttesa ? 'CATTURA-DURANTE-ATTESA' : 'guarda'); return guardaVera(...a); };
    const emettiVero = p.porte.emetti;
    p.porte.emetti = (nome, dati) => { if (nome === EVENTI.pausa || (nome === EVENTI.protezione && dati.decisione === 'chiedi')) log.push('annuncio'); emettiVero(nome, dati); };
    await eseguiCompito({ testoDellaPersona: testo, politica, porte: p.porte });
    return log;
  };
  const controlla = (log, nome) => {
    assert.equal(log.includes('CATTURA-DURANTE-ATTESA'), false, `${nome}: nessuna cattura mentre la persona ha la mano`);
    const inizi = log.flatMap((x, k) => (x === 'attesa:inizio' ? [k] : []));
    assert.ok(inizi.length > 0, `${nome}: c'è stata un'attesa`);
    for (const k of inizi) assert.equal(log[k - 1], 'annuncio', `${nome}: ogni attesa è annunciata subito prima (l'ospite smette di riprendere)`);
  };
  // chiedi_persona
  controlla(await giro({ risposte: [{ azioni: [{ tipo: 'chiedi_persona', motivo: 'codice' }] }, { fine: { riuscito: true } }], chiediPersona: () => 'fatto' }), 'chiedi_persona');
  // conferma di una protezione (permesso normale)
  controlla(await giro({ politica: NORMALE, testo: 'compra', risposte: [premi('b2'), { fine: { riuscito: true } }], chiediPersona: () => 'si' }), 'conferma');
  // riga «Posso» alla cassa
  controlla(await giro({ testo: 'cerca', risposte: [premi('b2')], permessoMancante: () => 'fallo-tu' }), 'permesso mancante');
  // anti-robot
  let risolto = false;
  controlla(await giro({ guarda: () => schermo({ elementi: [...(risolto ? [] : [{ ref: 'cap', ruolo: 'casella', nome: 'Non sono un robot' }]), { ref: 'sc', ruolo: 'pulsante', nome: 'Scarica' }] }),
    risposte: [premi('sc'), { fine: { riuscito: true } }], chiediPersona: () => { risolto = true; return 'fatto'; } }), 'anti-robot');
});

// ---------- tetto di spesa (owner 02/11) con le condizioni di Desktop, Mobile e Frontend ----------
const cassaDi = (righe, over = {}) => schermo({ titolo: 'Cassa - Negozio', dominio: 'negozio.example', elementi: [...righe.map((nome, k) => ({ ref: `r${k}`, ruolo: 'testo', nome })),
  { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }, { ref: 'conf', ruolo: 'pulsante', nome: 'Conferma pagamento' }, { ref: 'cc', ruolo: 'voce', nome: 'Visa •••• 4242' }], ...over });
const pianoNegozio = { domini: ['negozio.example'], app: [] };
async function paga({ righe = ['Totale 30,00 €'], frase = 'compra le cuffie, fino a 50 €', politica = NORMALE, risposte = [premi('paga'), { fine: { riuscito: true } }], over = {}, extra = {} }) {
  const p = porte({ guarda: () => cassaDi(righe, over), risposte, ...extra });
  const r = await eseguiCompito({ testoDellaPersona: frase, piano: pianoNegozio, politica, porte: p.porte });
  return { r, p };
}

test('CICLO-25: tetto di spesa — sotto paga da solo; sopra, senza totale, altra valuta, rinnovo, sospetto, fuori piano: carta; conto per il compito', async () => {
  // sotto il tetto: nessuna carta, e la traccia dice totale e resto (Mobile)
  const { r, p } = await paga({});
  assert.deepEqual([r.esito, p.domande.length, p.eseguite.length], ['riuscito', 0, 1]);
  assert.deepEqual(r.spese, [{ passo: 1, totale: { importo: 30, valuta: 'EUR' }, resta: 20, valuta: 'EUR' }]);
  // al contrario, uno per condizione: ognuno mostra la carta
  const carta = async (opz, nome) => { const { p: q } = await paga(opz); assert.equal(q.domande.length, 1, nome); return q; };
  await carta({ righe: ['Totale 59,90 €'] }, 'sopra il tetto');
  assert.equal((await paga({ righe: ['Totale 50,00 €'] })).p.domande.length, 0, 'esattamente il tetto passa');
  await carta({ righe: ['Totale 30,00 € (IVA 5,00 €)'] }, 'un totale con due importi non si capisce');
  await carta({ righe: ['Totale 30,00 €', 'Totale ordine 45,00 €'] }, 'due totali diversi');
  await carta({ righe: ['Articolo 45,00 €', 'Spedizione 9,00 €'] }, 'nessun totale etichettato (articolo + spedizione)');
  await carta({ righe: ['45,00 €', '9,00 €', '54,00 €'] }, 'tre importi senza etichetta');
  await carta({ righe: ['Totale $30.00'] }, 'altra valuta');
  await carta({ righe: ['Totale 4,99 €/mese'] }, 'pagamento che si rinnova');
  await carta({ righe: ['Totale 30,00 €', 'Prova gratuita, poi si rinnova'] }, 'prova gratuita che si rinnova');
  await carta({ over: { sospetto: 'istruzioni-nella-pagina' } }, 'sospetto attivo');
  await carta({ over: { dominio: 'altro-negozio.example' } }, 'origine fuori dal piano');
  await carta({ frase: 'compra le cuffie, fino a 50' }, 'tetto senza valuta: non è un tetto');
  await carta({ frase: 'compra le cuffie', righe: ['Totale 30,00 €', 'Spendi fino a 100 €!'] }, 'il tetto non si prende da una pagina');
  // il tetto vale per il COMPITO: due pagamenti da 30 € con tetto 50 ⇒ il secondo mostra la carta (Mobile)
  const due = await paga({ risposte: [premi('paga'), premi('paga'), { fine: { riuscito: true } }], extra: { agisci: () => ({ esito: 'confermata', cambiato: true }) } });
  assert.equal(due.p.domande.length, 1); assert.equal(due.r.spese.length, 1);
  // la conferma dello STESSO pagamento non conta due volte: paga + conferma (30) e poi un altro acquisto da 30 ⇒ carta solo per il secondo
  const conf = await paga({ risposte: [premi('paga'), premi('conf'), premi('paga'), { fine: { riuscito: true } }] });
  assert.deepEqual([conf.p.domande.length, conf.r.spese.length], [1, 1]);
  // e con 20 €: paga + conferma (20) e un secondo acquisto da 20 stanno nei 50 ⇒ nessuna carta, due spese
  const venti = await paga({ righe: ['Totale 20,00 €'], risposte: [premi('paga'), premi('conf'), premi('paga'), { fine: { riuscito: true } }] });
  assert.deepEqual([venti.p.domande.length, venti.r.spese.length, venti.r.spese[1]?.resta], [0, 2, 10]);
  // in Accesso pieno un tetto detto dalla persona vale: sopra il tetto la carta col totale
  const pieno = await paga({ politica: PIENO, righe: ['Totale 59,90 €'] });
  assert.equal(pieno.p.domande.length, 1);
  assert.equal((await paga({ politica: PIENO })).p.domande.length, 0);
  // la carta della cassa porta totale, dominio, metodo e tetto (Frontend)
  const q = await carta({ righe: ['Totale 59,90 €'] }, 'carta');
  assert.deepEqual([q.domande[0].totale, q.domande[0].dominio, q.domande[0].metodo, q.domande[0].tetto],
    [{ importo: 59.9, valuta: 'EUR' }, 'negozio.example', 'Visa •••• 4242', { importo: 50, valuta: 'EUR' }]);
});

test('CICLO-26: il tetto dalla riga «Posso» (abbassare vale, alzare è un tocco, mai col sospetto); pause della persona; chi ha deciso ogni azione', async () => {
  // la riga abbassa il tetto a 20 ⇒ 30 € mostra la carta; lo alza a 100 ⇒ 59,90 € passa; un tetto finto dalla riga non vale
  assert.equal((await paga({ extra: { richiestaAggiornata: () => ({ pagare: true, tetto: { importo: 20, valuta: 'EUR' } }) } })).p.domande.length, 1);
  const alto = await paga({ righe: ['Totale 59,90 €'], extra: { richiestaAggiornata: () => ({ pagare: true, tetto: { importo: 100, valuta: 'EUR' } }) } });
  assert.equal(alto.p.domande.length, 0);
  assert.equal(alto.r.decisioni[0].fonte, 'tocco-posso');
  assert.equal((await paga({ frase: 'compra le cuffie', extra: { richiestaAggiornata: () => ({ pagare: true, tetto: { importo: '100', valuta: 'EUR' } }) } })).p.domande.length, 1, 'tetto malformato');
  assert.equal((await paga({ frase: 'compra le cuffie', extra: { richiestaAggiornata: () => ({ pagare: true, tetto: { importo: Infinity, valuta: 'EUR' } }) } })).p.domande.length, 1, 'tetto infinito');
  assert.equal((await paga({ frase: 'compra le cuffie', extra: { richiestaAggiornata: () => ({ pagare: true, tetto: { importo: 100, valuta: 'XYZ' } }) } })).p.domande.length, 1, 'valuta sconosciuta');
  // pause della persona: inizio e fine attorno a ogni attesa (pillola «Non guardo lo schermo finché non riprendi»)
  const { p } = await paga({ righe: ['Totale 59,90 €'] });
  const pause = p.eventi.filter((e) => e.nome === EVENTI.pausa && e.dati.motivo === 'persona').map((e) => e.dati.fase);
  assert.deepEqual(pause, ['inizio', 'fine']);
  // chi ha deciso: la frase (con la citazione), il sì della carta, la serie, il tetto dalla frase
  const frase = await paga({ politica: PIENO, frase: 'compra le cuffie' });
  assert.deepEqual(frase.r.decisioni, [{ passo: 1, protezione: 'pagamento', azione: 'premi', fonte: 'frase', citazione: 'compra le cuffie' }]);
  const carta = await paga({ frase: 'compra le cuffie', risposte: [premi('paga'), premi('conf'), { fine: { riuscito: true } }] });
  assert.deepEqual(carta.r.decisioni.map((d) => d.fonte), ['si-carta', 'serie']);
  assert.equal((await paga({})).r.decisioni[0].fonte, 'frase');
  assert.ok(Object.hasOwn(frase.p.eventi.find((e) => e.nome === EVENTI.esito).dati, 'decisioni'), 'anche nell\'evento d\'esito');
});

// ---------- T1 carta unica all'inizio e T6 domanda unica per il gruppo (regola 17; forma T1-T6 con gli OK di Desktop, Frontend, Mobile) ----------
test('CICLO-27: carta unica all\'inizio — una volta, coi luoghi e la riga «Posso»; luogo nuovo chiede solo per quello; copre l\'invio nominato, mai il pagamento', { timeout: 5_000 }, async () => {
  const consensi = [];
  const conCarta = (risposta = 'si') => ({ consensoDelCompito: (d) => { consensi.push(d); return typeof risposta === 'function' ? risposta(d) : risposta; } });
  const sito = (over = {}) => schermo({ dominio: 'negozio.example', titolo: 'Negozio', ...over });
  // una carta sola, coi luoghi e la riga «Posso» (tetto compreso)
  const ok = porte({ guarda: () => sito(), risposte: [premi('b1'), premi('b1'), { fine: { riuscito: true } }], ...conCarta() });
  const r = await eseguiCompito({ testoDellaPersona: 'compra le cuffie, fino a 50 €', piano: { domini: ['negozio.example'], app: ['Esplora file'] }, politica: NORMALE, porte: ok.porte });
  assert.equal(r.esito, 'riuscito');
  assert.deepEqual(consensi, [{ domini: [{ nome: 'negozio.example' }], app: [{ nome: 'Esplora file' }], posso: { pagare: true, inviare: false, cancellare: false, tetto: { importo: 50, valuta: 'EUR' } }, accessi: [] }]);
  // no, risposta strana, tetto d'attesa: niente parte
  for (const [risp, motivo] of [['no', 'pulsante-ferma'], ['boh', 'pulsante-ferma'], [() => null, 'pulsante-ferma']]) {
    const x = porte({ guarda: () => sito(), risposte: [premi('b1')], ...conCarta(risp) });
    const rx = await eseguiCompito({ testoDellaPersona: 'x', piano: { domini: ['negozio.example'] }, politica: NORMALE, porte: x.porte });
    assert.deepEqual([rx.motivo, x.eseguite.length], [motivo, 0]);
  }
  const mai = porte({ guarda: () => sito(), risposte: [premi('b1')], consensoDelCompito: () => new Promise(() => {}) });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', piano: { domini: ['negozio.example'] }, politica: NORMALE, porte: mai.porte, limiti: { msAttesaPermesso: 20, msAnnullamento: 5 } })).motivo, 'attesa-scaduta');
  // senza la porta nessuna carta
  const senza = porte({ guarda: () => sito(), risposte: [premi('b1'), { fine: { riuscito: true } }] });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', piano: { domini: ['negozio.example'] }, politica: NORMALE, porte: senza.porte })).esito, 'riuscito');
  // un luogo nuovo chiede solo per quello, una volta; un sottodominio del piano no
  consensi.length = 0;
  let dove = 'www.negozio.example';
  const giro = porte({ guarda: () => sito({ dominio: dove }), risposte: [premi('b1'), premi('b1'), premi('b1'), { fine: { riuscito: true } }],
    agisci: () => { dove = 'pagamenti.altro.example'; return { esito: 'confermata' }; }, ...conCarta() });
  const rg = await eseguiCompito({ testoDellaPersona: 'x', piano: { domini: ['negozio.example'] }, politica: NORMALE, porte: giro.porte });
  assert.equal(rg.esito, 'riuscito');
  assert.deepEqual(consensi.slice(1), [{ nuovo: { dominio: 'pagamenti.altro.example' } }]);
  const rifiuto = porte({ guarda: () => sito({ dominio: 'altro.example' }), risposte: [premi('b1')], ...conCarta((d) => (d.nuovo ? 'no' : 'si')) });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', piano: { domini: ['negozio.example'] }, politica: NORMALE, porte: rifiuto.porte })).motivo, 'pulsante-ferma');
  const appNuova = porte({ guarda: () => schermo({ app: 'Blocco note', titolo: 'Senza titolo', dominio: undefined }), risposte: [premi('b1'), { fine: { riuscito: true } }], ...conCarta() });
  consensi.length = 0;
  await eseguiCompito({ testoDellaPersona: 'x', piano: { domini: [], app: ['Esplora file'] }, politica: NORMALE, porte: appNuova.porte });
  assert.deepEqual(consensi[1], { nuovo: { app: 'Blocco note' } });
  // invio coperto dal sì iniziale solo verso il destinatario NOMINATO e letto a schermo; mai col sospetto; il pagamento chiede sempre
  const chat = (nome, over = {}) => () => schermo({ dominio: 'web.whatsapp.com', titolo: 'WhatsApp', elementi: [...(nome ? [{ ref: 'h', ruolo: 'intestazione', nome }] : []), { ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }], ...over });
  const invia = async (guarda, frase = 'scrivi a Marco che arrivo alle 8', extra = conCarta()) => {
    const p = porte({ guarda, risposte: [premi('inv'), { fine: { riuscito: true } }], ...extra });
    await eseguiCompito({ testoDellaPersona: frase, piano: { domini: ['web.whatsapp.com'] }, politica: NORMALE, porte: p.porte });
    return p;
  };
  assert.equal((await invia(chat('Marco'))).domande.length, 0, 'Marco nominato e letto');
  assert.equal((await invia(chat('Luca'))).domande.length, 1, 'destinatario diverso');
  // revisione della CLI (CU-1): il nome si estrae dalla frase, la testata combacia per intero
  for (const testata of ['Gruppo «che» ridere', 'Alle elementari', 'Arrivo e partenza (canale)', 'che alle arrivo']) {
    assert.equal((await invia(chat(testata))).domande.length, 1, `parole comuni della frase: ${testata}`);
  }
  assert.equal((await invia(chat('Marco Rossi'))).domande.length, 1, 'combacia solo in parte: due Marco possibili');
  assert.equal((await invia(chat('Marco Bianchi'), 'manda il report a Marco Rossi')).domande.length, 1, 'omonimo');
  assert.equal((await invia(chat('Marco Rossi'), 'manda il report a Marco Rossi')).domande.length, 0, 'nome intero');
  assert.equal((await invia(chat('Marco'), 'manda il report a Marco Rossi')).domande.length, 1, 'manca il cognome');
  assert.equal((await invia(chat('Telegram'), 'Apri Telegram e scrivi a Marco')).domande.length, 1, 'il nome viene dopo «a», non dopo un verbo');
  assert.equal((await invia(chat('Marco 🙂'))).domande.length, 0, 'segni ed emoji non contano');
  // CU-4: un gruppo col nome e parole minuscole in più chiede
  for (const testata of ['Marco e altri 5', 'Marco e la famiglia', 'marco rossi fan club', 'Marco (lavoro)']) {
    assert.equal((await invia(chat(testata))).domande.length, 1, `parole in più: ${testata}`);
  }
  assert.equal((await invia(chat('Marco'), 'scrivi a marco che arrivo alle 8')).domande.length, 1, 'nessun nome nella frase');
  assert.equal((await invia(chat('Marco'), 'Scrivi su WhatsApp che arrivo alle 8')).domande.length, 1, 'nessun destinatario nella frase');
  assert.equal((await invia(chat('Niccolò D\'Angelo'), 'scrivi a Niccolò D\'Angelo che arrivo')).domande.length, 0, 'accenti e apostrofi');
  assert.equal((await invia(chat(null))).domande.length, 1, 'destinatario che non si legge');
  assert.equal((await invia(chat('Marco', { sospetto: 'x' }))).domande.length, 1, 'col sospetto');
  assert.equal((await invia(chat('Marco'), 'scrivi a Marco che arrivo alle 8', {})).domande.length, 1, 'senza la carta iniziale');
  assert.equal((await invia(chat('Marco'), 'apri la chat di Marco')).domande.length, 1, 'invio non chiesto nella frase');
  const compra = porte({ guarda: () => cassa(), risposte: [premi('paga'), { fine: { riuscito: true } }], ...conCarta() });
  await eseguiCompito({ testoDellaPersona: 'compra le cuffie', piano: { domini: ['negozio.example'] }, politica: NORMALE, porte: compra.porte });
  assert.equal(compra.domande.length, 1, 'il pagamento ha la sua carta alla cassa (owner)');
});

test('CICLO-28: domanda unica per il gruppo (T6) — due conferme diventano una, risposta per voce, schermo cambiato richiede, annulla e tetto d\'attesa', { timeout: 5_000 }, async () => {
  const login = () => schermo({ titolo: 'Accesso - Luce', dominio: 'luce.example', elementi: [{ ref: 'pw', ruolo: 'campo', nome: 'Password', segnali: { isPassword: true } }, { ref: 'tot', ruolo: 'testo', nome: 'Totale 84,20 €' }, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }] });
  const gruppo = { azioni: [{ tipo: 'scrivi', ref: 'pw', testo: 'inventata123' }, { tipo: 'premi', ref: 'paga' }] };
  const p = porte({ guarda: login, risposte: [gruppo, { fine: { riuscito: true } }] });
  const r = await eseguiCompito({ testoDellaPersona: 'paga la bolletta', politica: NORMALE, porte: p.porte });
  assert.deepEqual([r.esito, p.domande.length, p.eseguite.length], ['riuscito', 1, 2]);
  assert.equal(p.domande[0].motivo, 'conferme');
  assert.deepEqual(p.domande[0].voci.map((x) => [x.id, x.protezione]), [[0, 'credenziale'], [1, 'pagamento']]);
  assert.deepEqual(p.domande[0].voci[1].importo, { importo: 84.2, valuta: 'EUR' });
  assert.deepEqual(r.decisioni.map((d) => d.fonte), ['si-carta', 'si-carta']);
  // per voce: sì alla password, no al pagamento ⇒ la password si scrive, il pagamento no
  const perVoce = porte({ guarda: login, risposte: [gruppo, { fine: { riuscito: true } }], chiediPersona: () => ({ 0: 'si', 1: 'no' }) });
  const rv = await eseguiCompito({ testoDellaPersona: 'paga la bolletta', politica: NORMALE, porte: perVoce.porte });
  assert.deepEqual(perVoce.eseguite.map((e) => e.azione.tipo), ['scrivi']);
  assert.ok(rv.storia.some((x) => x.includes('rifiutata')));
  // il modello insiste: due «no» per voce alla stessa azione fermano, come i «no» di oggi
  // (un invio senza destinatario leggibile e un «Paga ora» non riusano mai un sì: tutte e due le voci tornano a ogni giro)
  const doppia = () => schermo({ titolo: 'Cassa - Luce', dominio: 'luce.example', elementi: [{ ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }, { ref: 'tot', ruolo: 'testo', nome: 'Totale 84,20 €' }, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }] });
  const gruppo2 = { azioni: [{ tipo: 'premi', ref: 'inv' }, { tipo: 'premi', ref: 'paga' }] };
  const insiste = porte({ guarda: doppia, risposte: [gruppo2, gruppo2, gruppo2, { fine: { riuscito: true } }], chiediPersona: () => ({ 0: 'si', 1: 'no' }) });
  assert.equal((await eseguiCompito({ testoDellaPersona: 'paga la bolletta', politica: NORMALE, porte: insiste.porte })).motivo, 'rifiutata-dalla-persona');
  assert.deepEqual(insiste.domande.map((d) => d.motivo), ['conferme', 'conferme']);
  // lo schermo cambia dopo la prima azione ⇒ la seconda chiede di nuovo
  let cambiata = false;
  const muta = porte({ guarda: () => (cambiata ? schermo({ ...login(), titolo: 'Pagamento - Luce' }) : login()), risposte: [gruppo, { fine: { riuscito: true } }], agisci: () => { cambiata = true; return { esito: 'confermata' }; } });
  await eseguiCompito({ testoDellaPersona: 'paga la bolletta', politica: NORMALE, porte: muta.porte });
  assert.deepEqual(muta.domande.map((d) => d.motivo), ['conferme', 'conferma']);
  // una voce sola: la domanda di oggi
  const una = porte({ guarda: login, risposte: [{ azioni: [{ tipo: 'premi', ref: 'paga' }] }, { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'paga la bolletta', politica: NORMALE, porte: una.porte });
  assert.deepEqual(una.domande.map((d) => d.motivo), ['conferma']);
  // annulla e tetto d'attesa
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: porte({ guarda: login, risposte: [gruppo], chiediPersona: () => 'annulla' }).porte })).motivo, 'pulsante-ferma');
  const lenta = porte({ guarda: login, risposte: [gruppo] });
  lenta.porte.chiediPersona = () => new Promise(() => {});
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: NORMALE, porte: lenta.porte, limiti: { msAttesaPermesso: 20, msAnnullamento: 5 } })).motivo, 'attesa-scaduta');
  // in Accesso pieno nessuna domanda unica (non chiede mai)
  const pieno = porte({ guarda: login, risposte: [{ azioni: [{ tipo: 'scrivi', ref: 'pw', testo: '{{segreto:luce.example}}' }, { tipo: 'premi', ref: 'paga' }] }, { fine: { riuscito: true } }] });
  await eseguiCompito({ testoDellaPersona: 'paga la bolletta', politica: PIENO, porte: pieno.porte });
  assert.equal(pieno.domande.length, 0);
});

// ---------- T7-T10 (censimento §8, OK di Desktop e Mobile con condizioni) e verifica della banca ----------
const conCartaSi = { consensoDelCompito: () => 'si' };
async function normale({ guarda, risposte, frase = 'x', piano = { domini: ['negozio.example'] }, extra = conCartaSi }) {
  const p = porte({ guarda, risposte: [...risposte, { fine: { riuscito: true } }], ...extra });
  const r = await eseguiCompito({ testoDellaPersona: frase, piano, politica: NORMALE, porte: p.porte });
  return { r, p };
}

test('CICLO-29: T7 informativa e T8 password dal portachiavi coperte dalla carta iniziale, con ogni caso al contrario', async () => {
  const casella = (nome, over = {}) => () => schermo({ dominio: 'negozio.example', titolo: 'Iscrizione', elementi: [{ ref: 'k', ruolo: 'casella', nome }], ...over });
  // T7
  assert.equal((await normale({ guarda: casella('Ho letto l\'informativa privacy'), risposte: [premi('k')] })).p.domande.length, 0, 'informativa coperta');
  assert.equal((await normale({ guarda: casella('Accetto termini e condizioni'), risposte: [premi('k')] })).p.domande.length, 1, 'termini: chiede');
  assert.equal((await normale({ guarda: casella('Ho letto l\'informativa e accetto i termini'), risposte: [premi('k')] })).p.domande.length, 1, 'informativa + termini: chiede');
  assert.equal((await normale({ guarda: casella('Ho letto l\'informativa privacy', { dominio: 'altro.example' }), risposte: [premi('k')], piano: { domini: ['negozio.example', 'altro.example'] } })).p.domande.length, 0, 'dominio del piano');
  assert.equal((await normale({ guarda: casella('Ho letto l\'informativa privacy', { sospetto: 'x' }), risposte: [premi('k')] })).p.domande.length, 1, 'sospetto');
  assert.equal((await normale({ guarda: casella('Ho letto l\'informativa privacy', { dominio: 'altro.example' }), risposte: [premi('k')] })).p.domande.length, 1, 'fuori dal piano (anche se poi consentito come luogo nuovo)');
  assert.equal((await normale({ guarda: casella('Ho letto l\'informativa privacy'), risposte: [premi('k')], extra: {} })).p.domande.length, 1, 'senza la carta iniziale');
  const news = await normale({ guarda: casella('Voglio ricevere la newsletter e le offerte'), risposte: [premi('k')], extra: { ...conCartaSi, scegliRiservato: () => ({ esito: 'confermata' }) } });
  assert.equal(news.p.eseguite.length, 0, 'marketing: mai spuntata, scelta riservata');
  // T8
  const login = (dominio, over = {}) => () => schermo({ dominio, titolo: 'Accesso', elementi: [{ ref: 'pw', ruolo: 'campo', nome: 'Password', segnali: { isPassword: true }, origine: dominio, ...over }] });
  const scrivi = (testo = '{{segreto:luce.example}}') => ({ azioni: [{ tipo: 'scrivi', ref: 'pw', testo }] });
  const pianoLuce = { domini: ['luce.example', 'luce-example.com', 'luce.example.evil.com'], accessi: ['luce.example'] };
  assert.equal((await normale({ guarda: login('luce.example'), risposte: [scrivi()], piano: pianoLuce })).p.domande.length, 0, 'accesso elencato');
  for (const [nome, guarda, az] of [
    ['dominio sosia', login('luce-example.com'), scrivi()], ['sottodominio ingannevole', login('luce.example.evil.com'), scrivi()],
    ['voce di un altro dominio', login('luce.example'), scrivi('{{segreto:altro.example}}')],
    ['campo in un riquadro di un\'altra origine', login('luce.example', { origine: 'pubblicita.example' }), scrivi()],
    ['origine del campo sconosciuta (CU-2)', login('luce.example', { origine: undefined }), scrivi()],
  ]) assert.equal((await normale({ guarda, risposte: [az], piano: pianoLuce })).p.domande.length, 1, nome);
  assert.equal((await normale({ guarda: () => ({ ...login('luce.example')(), sospetto: 'x' }), risposte: [scrivi()], piano: pianoLuce })).p.domande.length, 1, 'sospetto');
  assert.equal((await normale({ guarda: login('luce.example'), risposte: [scrivi()], piano: { domini: ['luce.example'] } })).p.domande.length, 1, 'accesso non elencato nella carta');
  assert.equal((await normale({ guarda: login('luce.example'), risposte: [scrivi('inventata123')], piano: pianoLuce })).p.domande.length, 1, 'segreto in chiaro');
  const carte = [];
  await normale({ guarda: login('luce.example'), risposte: [scrivi()], piano: pianoLuce, extra: { consensoDelCompito: (d) => { carte.push(d); return 'si'; } } });
  assert.deepEqual(carte[0].accessi, [{ dominio: 'luce.example' }], 'la carta elenca l\'accesso, mai il segreto');
});

test('CICLO-30: T9 conferma sulla pagina raggiunta dal «Paga ora», T10 cestino della cartella nominata, verifica della banca alla persona', { timeout: 5_000 }, async () => {
  // T9
  let pagina = 'bolletta';
  const sito = (totaleConferma = 'Totale 84,20 €') => () => (pagina === 'bolletta'
    ? schermo({ dominio: 'luce.example', titolo: 'Bolletta', elementi: [{ ref: 't', ruolo: 'testo', nome: 'Importo da pagare 84,20 €' }, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }] })
    : schermo({ dominio: 'luce.example', titolo: 'Pagamento', elementi: [{ ref: 't', ruolo: 'testo', nome: totaleConferma }, { ref: 'conf', ruolo: 'pulsante', nome: 'Conferma pagamento' }] }));
  const vai = { agisci: () => { pagina = 'pagamento'; return { esito: 'confermata', cambiato: true }; } };
  const giro = async (guarda, risposte) => { pagina = 'bolletta'; return normale({ guarda, risposte, frase: 'paga la bolletta', piano: { domini: ['luce.example'] }, extra: { ...conCartaSi, ...vai } }); };
  assert.equal((await giro(sito(), [premi('paga'), premi('conf')])).p.domande.length, 1, 'una carta per il pagamento su due pagine');
  assert.equal((await giro(sito('Totale 99,00 €'), [premi('paga'), premi('conf')])).p.domande.length, 2, 'totale diverso');
  assert.equal((await giro(sito(), [premi('paga'), { azioni: [{ tipo: 'scorri' }] }, premi('conf')])).p.domande.length, 2, 'un\'altra azione in mezzo');
  // verifica della banca: mai toccata, la mano passa alla persona
  let verificata = false;
  const banca = () => schermo({ dominio: 'luce.example', titolo: 'Pagamento', elementi: verificata ? [{ ref: 'ok', ruolo: 'pulsante', nome: 'Torna al sito' }] : [{ ref: 'c', ruolo: 'campo', nome: 'Inserisci il codice ricevuto via SMS' }, { ref: 'v', ruolo: 'pulsante', nome: 'Verifica' }] });
  const conBanca = await normale({ guarda: banca, risposte: [{ azioni: [{ tipo: 'scrivi', ref: 'c', testo: '123456' }] }, premi('ok')], piano: { domini: ['luce.example'] },
    extra: { ...conCartaSi, chiediPersona: (q) => { if (q.motivo === 'verifica-banca') verificata = true; return 'fatto'; } } });
  assert.equal(conBanca.p.eseguite.some((e) => e.azione.tipo === 'scrivi'), false, 'il codice non lo scrive mai TALOS');
  assert.ok(conBanca.p.domande.some((q) => q.motivo === 'verifica-banca'));
  verificata = false;
  const annulla = await normale({ guarda: banca, risposte: [premi('v')], piano: { domini: ['luce.example'] }, extra: { ...conCartaSi, chiediPersona: () => 'annulla' } });
  assert.deepEqual([annulla.r.motivo, annulla.p.eseguite.length], ['pulsante-ferma', 0]);
  const senzaPorta = porte({ guarda: banca, risposte: [{ azioni: [{ tipo: 'premi', ref: 'v' }] }] });
  delete senzaPorta.porte.chiediPersona;
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: senzaPorta.porte })).motivo, 'verifica-banca');
  // T10
  const cartella = (titolo, over = {}) => () => schermo({ titolo, app: 'Esplora file', dominio: undefined, elementi: [{ ref: 'lista', ruolo: 'lista', nome: 'Elementi' }], ...over });
  const canc = { azioni: [{ tipo: 'tasti', ref: 'lista', combinazione: 'shift+delete' }] };
  const t10 = await normale({ guarda: cartella('Download - Esplora file'), risposte: [canc], frase: 'svuota la cartella Download', piano: { domini: [] } });
  assert.deepEqual([t10.p.domande.length, t10.p.eseguite[0]?.azione.combinazione], [0, 'delete'], 'nel cestino, recuperabile, senza carta');
  for (const [nome, guarda, frase, extra] of [
    ['cartella non nominata', cartella('Documenti - Esplora file'), 'svuota la cartella Download', conCartaSi],
    ['frase senza nome', cartella('Download - Esplora file'), 'fai pulizia', conCartaSi],
    ['il cestino stesso', cartella('Cestino - Esplora file'), 'svuota il cestino', conCartaSi],
    ['col sospetto', cartella('Download - Esplora file', { sospetto: 'x' }), 'svuota la cartella Download', conCartaSi],
    ['senza la carta iniziale', cartella('Download - Esplora file'), 'svuota la cartella Download', {}],
    ['pagina del browser che si chiama come la cartella (CU-3)', cartella('Download - Google Chrome', { app: 'Google Chrome', dominio: 'download.example' }), 'svuota la cartella Download', conCartaSi],
    ['browser senza dominio letto', cartella('Download - Google Chrome', { app: 'Google Chrome' }), 'svuota la cartella Download', conCartaSi],
    ['app sconosciuta', cartella('Download - Esplora file', { app: undefined }), 'svuota la cartella Download', conCartaSi],
    ['Esplora file con un indirizzo letto', cartella('Download - Esplora file', { dominio: 'download.example' }), 'svuota la cartella Download', conCartaSi],
  ]) {
    // il dominio della pagina è nel piano: senza, il luogo nuovo chiuderebbe il gruppo e la prova passerebbe senza agire
    const x = await normale({ guarda, risposte: [canc], frase, piano: { domini: ['download.example'] }, extra });
    assert.deepEqual([x.p.domande.length, x.p.eseguite.length], [1, 1], nome);
  }
});

test('CICLO-22: anti-robot — il ciclo aspetta la persona e riparte (T4); annulla, tetto d\'attesa, controllo che resta, e senza porta come prima', { timeout: 5_000 }, async () => {
  let risolto = false;
  const pagina = () => schermo({ elementi: [...(risolto ? [] : [{ ref: 'cap', ruolo: 'casella', nome: 'Non sono un robot' }]), { ref: 'sc', ruolo: 'pulsante', nome: 'Scarica' }] });
  const domandeAR = [];
  const ok = porte({ guarda: pagina, risposte: [premi('sc'), { fine: { riuscito: true } }], chiediPersona: (q) => { domandeAR.push(q.motivo); risolto = true; return 'fatto'; } });
  const r = await eseguiCompito({ testoDellaPersona: 'scarica il modulo', politica: PIENO, porte: ok.porte });
  assert.deepEqual([r.esito, ok.eseguite.length, domandeAR], ['riuscito', 1, ['anti-robot']]);
  assert.ok(ok.eventi.some((e) => e.nome === EVENTI.pausa && e.dati.motivo === 'anti-robot'));
  assert.ok(r.storia.some((x) => x.includes('risolto il controllo')));
  risolto = false;
  const no = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: porte({ guarda: pagina, risposte: [premi('sc')], chiediPersona: () => 'annulla' }).porte });
  assert.equal(no.motivo, 'pulsante-ferma');
  const mai = porte({ guarda: pagina, risposte: [premi('sc')] });
  mai.porte.chiediPersona = () => new Promise(() => {});
  const rm = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: mai.porte, limiti: { msAttesaPermesso: 30, msAnnullamento: 5 } });
  assert.equal(rm.motivo, 'attesa-scaduta', 'stesso tetto della riga «Posso» (condizione del Desktop)');
  const ostinato = porte({ guarda: pagina, risposte: [premi('sc')], chiediPersona: () => 'fatto' }); // dice fatto ma il controllo resta
  const ro = await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: ostinato.porte });
  assert.deepEqual([ro.motivo, ostinato.domande.length, ostinato.eseguite.length], ['protezione:anti-robot', 3, 0]);
  const senzaPorta = porte({ guarda: pagina, risposte: [premi('sc')] });
  delete senzaPorta.porte.chiediPersona;
  assert.equal((await eseguiCompito({ testoDellaPersona: 'x', politica: PIENO, porte: senzaPorta.porte })).motivo, 'protezione:anti-robot');
});

test('CICLO-20: l\'attesa davanti alla riga ha un tetto (condizione a del Desktop) e l\'orologio dei tetti è fermo mentre si aspetta', { timeout: 5_000 }, async () => {
  const mai = porte({ risposte: [compra], permessoMancante: () => new Promise(() => {}) });
  const r = await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: mai.porte, limiti: { msAttesaPermesso: 30, msAnnullamento: 5 } });
  assert.deepEqual([r.motivo, r.causa, mai.eseguite.length], ['attesa-scaduta', 'non-chiesto', 0]);
  let segnale = null;
  const conSegnale = porte({ risposte: [compra], permessoMancante: (_d, s) => { segnale = s; return new Promise(() => {}); } });
  await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: conSegnale.porte, limiti: { msAttesaPermesso: 20, msAnnullamento: 5 } });
  assert.equal(segnale?.aborted, true, 'scaduta l\'attesa, la scheda riceve l\'annullamento e si chiude');
  // 80 ms ad aspettare la persona con un tetto di 50 ms sul compito: con l'orologio fermo il compito finisce lo stesso
  let riga = { pagare: false };
  const lenta = porte({ risposte: [compra, { fine: { riuscito: true } }], adesso: () => Date.now(), richiestaAggiornata: () => riga,
    permessoMancante: () => new Promise((ok) => setTimeout(() => { riga = { pagare: true }; ok('aggiunto'); }, 80)) });
  const rl = await eseguiCompito({ testoDellaPersona: 'cerca', politica: PIENO, porte: lenta.porte, limiti: { millisecondi: 50 } });
  assert.equal(rl.esito, 'riuscito');
  assert.ok(lenta.eventi.find((e) => e.nome === EVENTI.esito).dati.msAttesa >= 70, 'il tempo d\'attesa è misurato');
});

test('CICLO-31: T11 metodo salvato coperto dal sì della cassa — preselezionato o nominato, uno, una volta; CVV alla persona', { timeout: 5_000 }, async () => {
  const PERS = { ref: 'm1', ruolo: 'voce', nome: 'Visa •••• 4242 (personale)' };
  const AZ = { ref: 'm2', ruolo: 'voce', nome: 'Mastercard •••• 1111 (aziendale)' };
  const scelto = (m) => ({ ...m, stato: { selezionato: true } });
  let pagina = 'bolletta'; let dopoMano = [];
  const sito = ({ metodi = [scelto(PERS), AZ], extra = [], cassaExtra = [], over = {} } = {}) => () => (pagina === 'esito'
    ? schermo({ dominio: 'luce.example', titolo: 'Esito', elementi: [{ ref: 'ok', ruolo: 'testo', nome: 'Pagamento riuscito' }, { ref: 'cont', ruolo: 'pulsante', nome: 'Continua' }, { ref: 'tor', ruolo: 'pulsante', nome: 'Torna al sito' }] })
    : pagina === 'dopo-mano'
      ? schermo({ dominio: 'luce.example', titolo: 'Pagamento', elementi: [{ ref: 't', ruolo: 'testo', nome: 'Totale 84,20 €' }, ...dopoMano] })
      : pagina === 'bolletta'
    ? schermo({ dominio: 'luce.example', titolo: 'Bolletta', elementi: [{ ref: 't', ruolo: 'testo', nome: 'Importo da pagare 84,20 €' }, ...cassaExtra, { ref: 'paga', ruolo: 'pulsante', nome: 'Paga ora' }] })
    : schermo({ dominio: 'luce.example', titolo: 'Pagamento', elementi: [{ ref: 't', ruolo: 'testo', nome: 'Totale 84,20 €' }, ...metodi, ...extra, { ref: 'conf', ruolo: 'pulsante', nome: 'Conferma pagamento' }], ...over }));
  const vai = { agisci: (a) => (a.ref === 'paga' ? (pagina = 'pagamento', { esito: 'confermata', cambiato: true }) : { esito: 'confermata' }) };
  const giro = async (guarda, risposte, frase = 'paga la bolletta', extra = {}) => {
    pagina = 'bolletta';
    return normale({ guarda, risposte, frase, piano: { domini: ['luce.example'] }, extra: { ...conCartaSi, ...vai, ...extra } });
  };
  const lotto = (...refs) => ({ azioni: refs.map((ref) => ({ tipo: 'premi', ref })) });
  // preselezionato dalla pagina: una carta sola (la cassa), nello stesso gruppo o in gruppi separati; il metodo nella riga
  const a = await giro(sito(), [premi('paga'), lotto('m1', 'conf')]);
  assert.deepEqual([a.p.domande.length, a.p.eseguite.map((e) => e.bersaglio)], [1, ['Paga ora', 'Visa •••• 4242 (personale)', 'Conferma pagamento']]);
  assert.deepEqual(a.r.decisioni.map((d) => [d.fonte, d.metodo ?? null]), [['si-carta', null], ['si-carta', 'Visa •••• 4242 (personale)'], ['si-carta', 'Visa •••• 4242 (personale)']]);
  assert.equal((await giro(sito(), [premi('paga'), premi('m1'), premi('conf')])).p.domande.length, 1, 'gruppi separati');
  // nominato nella frase, senza ambiguità (anche con le ultime cifre)
  assert.equal((await giro(sito({ metodi: [PERS, AZ] }), [premi('paga'), lotto('m2', 'conf')], 'paga la bolletta con la Mastercard')).p.domande.length, 1, 'nominato');
  assert.equal((await giro(sito({ metodi: [PERS, AZ] }), [premi('paga'), lotto('m2', 'conf')], 'paga la bolletta con la 1111')).p.domande.length, 1, 'ultime cifre');
  assert.equal((await giro(sito({ metodi: [PERS, AZ] }), [premi('paga'), lotto('m2', 'conf')], 'paga la bolletta con la carta aziendale')).p.domande.length, 1, '«con la carta aziendale»');
  assert.equal((await giro(sito({ metodi: [PERS, AZ] }), [premi('paga'), lotto('m1', 'conf')], 'paga la bolletta con la carta che finisce per 4242')).p.domande.length, 1, 'ultime quattro cifre');
  // CU-5: il nome viene solo da «con …», le cifre devono essere le ultime quattro esatte; la cassa mostra il metodo nominato
  const cassaNominata = await giro(sito({ cassaExtra: [scelto(PERS), AZ] }), [premi('paga')], 'paga la bolletta con la Mastercard');
  assert.equal(cassaNominata.p.domande.find((q) => q.protezione === 'pagamento')?.metodo, 'Mastercard •••• 1111 (aziendale)');
  // al contrario: chiede (cassa + una domanda per il metodo e la conferma)
  for (const [nome, guarda, risposte, frase] of [
    ['preselezionata la personale, il modello sceglie l\'aziendale', sito(), [premi('paga'), lotto('m2', 'conf')], undefined],
    ['due metodi, nessuno scelto né nominato', sito({ metodi: [PERS, AZ] }), [premi('paga'), lotto('m1', 'conf')], undefined],
    ['un solo metodo ma non scelto dalla pagina', sito({ metodi: [PERS] }), [premi('paga'), lotto('m1', 'conf')], undefined],
    ['nome che indica due metodi', sito({ metodi: [PERS, { ...AZ, nome: 'Visa •••• 9999 (aziendale)' }] }), [premi('paga'), lotto('m1', 'conf')], 'paga la bolletta con la Visa'],
    ['«carta» non distingue', sito({ metodi: [{ ...PERS, nome: 'Carta Visa •••• 4242' }, AZ] }), [premi('paga'), lotto('m1', 'conf')], 'paga la bolletta con la carta'],
    ['nominata l\'aziendale, il modello tiene la preselezionata', sito(), [premi('paga'), lotto('m1', 'conf')], 'paga la bolletta con la Mastercard'],
    ['il metodo una volta sola', sito(), [premi('paga'), lotto('m1', 'm1', 'conf')], undefined],
    ['un anno nella frase (CU-5)', sito({ metodi: [scelto(PERS), { ...AZ, nome: 'Mastercard •••• 2027 (aziendale)' }] }), [premi('paga'), lotto('m2', 'conf')], 'paga la bolletta del 2027'],
    ['una marca nella frase (CU-5)', sito({ metodi: [scelto(PERS), { ...AZ, nome: 'Amazon Mastercard •••• 1111' }] }), [premi('paga'), lotto('m2', 'conf')], 'paga la bolletta della luce Amazon'],
    ['cifre non intere', sito({ metodi: [PERS, AZ] }), [premi('paga'), lotto('m2', 'conf')], 'paga la bolletta con la 11'],
    ['nominato un metodo che a schermo non c\'è', sito(), [premi('paga'), lotto('m1', 'conf')], 'paga la bolletta con la Amex'],
    ['due nomi di metodo nella frase: ambiguo, mai il ripiego sul preselezionato', sito(), [premi('paga'), lotto('m1', 'conf')], 'paga la bolletta con calma con la Mastercard'],
    ['due metodi segnati come scelti', sito({ metodi: [scelto(PERS), scelto(AZ)] }), [premi('paga'), lotto('m1', 'conf')], undefined],
    ['col sospetto', sito({ over: { sospetto: 'x' } }), [premi('paga'), lotto('m1', 'conf')], undefined],
    ['pagina con il CVV da scrivere', sito({ extra: [{ ref: 'cvv', ruolo: 'campo', nome: 'CVV' }] }), [premi('paga'), lotto('m1', 'conf')], undefined],
  ]) {
    const x = await giro(guarda, risposte, frase);
    assert.ok(x.p.domande.length >= 2, `${nome}: ${x.p.domande.length} domande`);
  }
  // la domanda unica segue il ponte: metodo e conferma coperti non entrano nell'elenco con l'azione delicata che viene dopo
  const dopo = await giro(sito({ extra: [{ ref: 'b2', ruolo: 'pulsante', nome: 'Acquista ora' }] }), [premi('paga'), lotto('m1', 'conf', 'b2')]);
  assert.deepEqual(dopo.p.domande.map((q) => q.motivo), ['conferma', 'conferma'], 'nessuna domanda unica con la conferma già coperta');
  // CVV: lo scrive la persona, mai TALOS; il valore non passa
  const cvv = await giro(sito({ extra: [{ ref: 'cvv', ruolo: 'campo', nome: 'Codice di sicurezza (CVV)' }] }), [premi('paga'), { azioni: [{ tipo: 'scrivi', ref: 'cvv', testo: '123' }] }], 'paga la bolletta',
    { chiediPersona: (q) => (q.motivo === 'codice-sicurezza' ? 'fatto' : 'si') });
  assert.equal(cvv.p.eseguite.some((e) => e.azione.tipo === 'scrivi'), false, 'il CVV non lo scrive mai TALOS');
  assert.ok(cvv.p.domande.some((q) => q.motivo === 'codice-sicurezza' && q.ancheIlClic === true && !JSON.stringify(q).includes('123')), '«scrivi il codice e premi tu Paga»');
  // al ritorno della mano: la conferma ancora a schermo ⇒ si chiude con una frase, senza premerla
  assert.equal(cvv.r.motivo, 'pagamento-non-completato');
  assert.ok(cvv.p.eventi.some((e) => e.dati?.esito === 'conferma-a-schermo'));
  // pagato dalla persona ⇒ si prosegue; la traccia lo dice; TALOS non tocca la conferma in nessun caso
  const conCvv = sito({ extra: [{ ref: 'cvv', ruolo: 'campo', nome: 'CVV' }] });
  const pagato = await giro(conCvv, [premi('paga'), { azioni: [{ tipo: 'scrivi', ref: 'cvv', testo: '123' }] }, premi('cont')], 'paga la bolletta',
    { chiediPersona: (q) => { if (q.motivo === 'codice-sicurezza') { pagina = 'esito'; return 'fatto'; } return 'si'; } });
  assert.equal(pagato.r.esito, 'riuscito');
  assert.ok(pagato.p.eventi.some((e) => e.dati?.esito === 'pagato-dalla-persona'));
  assert.deepEqual(pagato.p.domande.map((q) => q.motivo), ['conferma', 'codice-sicurezza'], 'la cassa e il passaggio di mano: nessuna conferma ripetuta');
  assert.ok(pagato.p.eseguite.some((e) => e.bersaglio === 'Continua'), '«Continua» sulla pagina d\'esito non è un pulsante del pagamento');
  for (const x of [cvv, pagato]) assert.equal(x.p.eseguite.some((e) => e.bersaglio === 'Conferma pagamento'), false, 'mai la conferma dopo un CVV');
  // un pulsante che paga ancora a schermo (senza il campo) conta come non completato; «Continua» da solo no (pagina d'esito)
  for (const [nome, resto] of [
    ['solo il pulsante di conferma', [{ ref: 'conf', ruolo: 'pulsante', nome: 'Conferma pagamento' }]],
    ['solo il pulsante che paga', [{ ref: 'p2', ruolo: 'pulsante', nome: 'Paga 84,20 €' }]],
    ['solo il campo del codice', [{ ref: 'cvv', ruolo: 'campo', nome: 'CVV' }]],
  ]) {
    dopoMano = resto;
    const x = await giro(conCvv, [premi('paga'), { azioni: [{ tipo: 'scrivi', ref: 'cvv', testo: '1' }] }], 'paga la bolletta',
      { chiediPersona: (q) => { if (q.motivo === 'codice-sicurezza') { pagina = 'dopo-mano'; return 'fatto'; } return 'si'; } });
    assert.equal(x.r.motivo, 'pagamento-non-completato', nome);
  }
  const cvvAuto = await giro(sito({ extra: [{ ref: 'cvv', ruolo: 'campo', nome: 'Sicurezza', segnali: { autocomplete: 'cc-csc' } }] }), [premi('paga'), { azioni: [{ tipo: 'scrivi', ref: 'cvv', testo: '123' }] }], 'paga la bolletta', { chiediPersona: (q) => (q.motivo === 'codice-sicurezza' ? 'annulla' : 'si') });
  assert.deepEqual([cvvAuto.r.motivo, cvvAuto.p.eseguite.some((e) => e.azione.tipo === 'scrivi')], ['pulsante-ferma', false], 'riconosciuto dal campo del browser; annullato ⇒ fermo');
  // il metodo letto alla cassa compare nella carta: quello già scelto dalla pagina, non il primo della lista
  const vista = await giro(sito({ cassaExtra: [AZ, scelto(PERS)] }), [premi('paga')]);
  assert.equal(vista.p.domande.find((q) => q.protezione === 'pagamento')?.metodo, 'Visa •••• 4242 (personale)');
});

test('CICLO-32: un solo estrattore di nomi — destinatario, metodo e cartella per intero; nessun sacco di parole nel ciclo', { timeout: 5_000 }, async () => {
  // guardia sul sorgente (Desktop, 02/11): la frase della persona entra solo nelle funzioni che la leggono per campi; nessun
  // `every(`/`has(` su parole sparse della frase (la malattia di CU-1 e CU-5)
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../src/computer-use/ciclo.mjs', import.meta.url), 'utf8');
  const usi = [...sorgente.matchAll(/^.*\btestoDellaPersona\b.*$/gmu)].map((m) => m[0].trim());
  const ammessi = [/^\* @param/u, /^export async function eseguiCompito\(\{ testoDellaPersona,/u, /intenzioniDallaFrase\(testoDellaPersona\)/u,
    /tettoDallaFrase\(testoDellaPersona\)/u, /leggiOrdinale\(testoDellaPersona\)/u, /nomeNellaFrase\(testoDellaPersona, '(?:destinatario|cartella|metodo)'\)/u,
    /String\(testoDellaPersona \?\? ''\)/u];
  assert.deepEqual(usi.filter((u) => !ammessi.some((r) => r.test(u))), [], 'la frase entra solo dagli estrattori');
  assert.equal(/parolePiane|\bnominati\b/u.test(sorgente), false, 'niente sacco di parole');
  // destinatario: due nomi diversi nella frase ⇒ ambiguo ⇒ chiede
  const chat = (nome) => () => schermo({ dominio: 'web.whatsapp.com', titolo: 'WhatsApp', elementi: [{ ref: 'h', ruolo: 'intestazione', nome }, { ref: 'inv', ruolo: 'pulsante', nome: 'Invia' }] });
  const invia = async (testata, frase) => (await normale({ guarda: chat(testata), risposte: [premi('inv')], frase, piano: { domini: ['web.whatsapp.com'] } })).p.domande.length;
  assert.equal(await invia('Natale', 'Per Natale scrivi a Marco che arrivo'), 1, 'due nomi: chiede');
  assert.equal(await invia('Marco', 'Per Natale scrivi a Marco che arrivo'), 1, 'due nomi: chiede anche per quello giusto');
  assert.equal(await invia('Marco', 'scrivi a Marco per dirgli che arrivo'), 0, '«per» seguito da minuscola non è un nome');
  // cartella: estratta dopo «cartella» o il verbo, confrontata per intero col titolo di Esplora file
  const cartella = (titolo) => () => schermo({ titolo, app: 'Esplora file', dominio: undefined, elementi: [{ ref: 'lista', ruolo: 'lista', nome: 'Elementi' }] });
  const canc = { azioni: [{ tipo: 'tasti', ref: 'lista', combinazione: 'shift+delete' }] };
  const svuota = async (titolo, frase) => (await normale({ guarda: cartella(titolo), risposte: [canc], frase, piano: { domini: [], app: ['Esplora file'] } })).p.domande.length;
  assert.equal(await svuota('Download - Esplora file', 'Svuota Download'), 0, 'subito dopo il verbo');
  assert.equal(await svuota('Download - Esplora file', 'svuota la cartella Download'), 0, 'dopo «cartella»');
  assert.equal(await svuota('Documenti - Esplora file', 'svuota la cartella Download dei documenti'), 1, 'parola sparsa della frase (difetto trovato il 02/11)');
  assert.equal(await svuota('Foto Vacanze - Esplora file', 'svuota la cartella Foto'), 1, 'titolo con una parola in più');
  assert.equal(await svuota('Foto - Esplora file', 'svuota la cartella Foto Vacanze'), 1, 'titolo con una parola in meno');
  assert.equal(await svuota('Download - Esplora file', 'svuota la cartella download'), 1, 'nome in minuscolo: non estratto, chiede');
  assert.equal(await svuota('Download - Esplora file', 'svuota la cartella Download e la cartella Musica'), 1, 'due cartelle: chiede');
});
