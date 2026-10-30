/*
 * 29/10/2026 — ogni domanda di consenso porta l'id della SUA chiamata (`azione.toolCallId`). Le interfacce lo usano per dire che quella
 * riga aspetta la persona invece di «in esecuzione» (desktop: testa del gruppo; CLI: `transcript-model.ts:520-524`, `askedPerson`).
 * Oggi c'è in tutti i cancelli; questa guardia impedisce che un cancello aggiunto dopo riapra il buco (richiesta della CLI, 29/10).
 * Legge il sorgente del kernel: per ogni chiamata a un cancello, il primo argomento è un oggetto scritto lì (e deve dire `toolCallId`)
 * oppure il passaggio dell'azione ricevuta, permesso solo DENTRO i cancelli stessi.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CANCELLI = ['verificaPermessoConBarriera', 'verificaAzioneAutomazione', 'verificaAvvioAgente', 'chiediApprovazioneFn'];
const PASSAGGI_DENTRO_I_CANCELLI = new Set(['azione', 'azioneDaChiedere']);

/** Il primo argomento di ogni chiamata a un cancello: il testo fino alla prima virgola o parentesi chiusa al livello zero. */
export function primiArgomentiDeiCancelli(sorgente) {
  const trovati = [];
  const cerca = new RegExp(`(?<![\\w.])(${CANCELLI.join('|')})\\(`, 'gu');
  for (const m of sorgente.matchAll(cerca)) {
    const prima = sorgente.slice(Math.max(0, m.index - 40), m.index);
    if (/(?:function\s+|const\s+)$/u.test(prima)) continue; // la definizione, non una chiamata
    let i = m.index + m[0].length;
    let livello = 0;
    const inizio = i;
    for (; i < sorgente.length; i += 1) {
      const ch = sorgente[i];
      if (ch === '{' || ch === '(' || ch === '[') livello += 1;
      else if (ch === '}' || ch === ']' || (ch === ')' && livello > 0)) livello -= 1;
      else if ((ch === ',' || ch === ')') && livello === 0) break;
    }
    const riga = sorgente.slice(0, m.index).split('\n').length;
    trovati.push({ cancello: m[1], riga, indice: m.index, argomento: sorgente.slice(inizio, i).trim() });
  }
  return trovati;
}

/*
 * Revisione del blocco 19: il passaggio dell'azione ricevuta (`azione`, `azioneDaChiedere`) è ammesso SOLO dentro il corpo delle tre
 * funzioni-cancello, che la ricevono già con l'id da chi le chiama. Prima la prova guardava solo il nome dell'argomento: un cancello
 * nuovo in fondo al file con `chiediApprovazioneFn(azione)` restava verde (provato dal revisore).
 */
const DEFINIZIONI_DEI_CANCELLI = ['verificaAvvioAgente', 'verificaAzioneAutomazione', 'verificaPermessoScrittura'];
/* Seconda verifica del blocco 19: «fino al prossimo `export`» lasciava dentro una funzione NON esportata scritta subito dopo un
   cancello. Il corpo finisce dove si chiude la sua graffa: si salta la lista dei parametri (che ha `{ … } = {}`) bilanciando le
   tonde, poi si contano le graffe del corpo. */
function fineDelCorpo(sorgente, inizio) {
  let i = sorgente.indexOf('(', inizio);
  for (let tonde = 0; i < sorgente.length; i += 1) {
    if (sorgente[i] === '(') tonde += 1;
    else if (sorgente[i] === ')' && --tonde === 0) break;
  }
  i = sorgente.indexOf('{', i);
  for (let graffe = 0; i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') graffe += 1;
    else if (sorgente[i] === '}' && --graffe === 0) return i;
  }
  return sorgente.length;
}
function corpiDeiCancelli(sorgente) {
  return DEFINIZIONI_DEI_CANCELLI.flatMap((nome) => {
    const inizio = sorgente.indexOf(`export async function ${nome}(`);
    return inizio === -1 ? [] : [[inizio, fineDelCorpo(sorgente, inizio)]];
  });
}
/* Terza verifica del blocco 19: il conteggio delle graffe non riconosce stringhe e regex (`"{"` nel corpo lo apriva fino alla funzione
   dopo). Sul kernel VERO il corpo di ogni cancello si prende dalla funzione stessa: `toString()` restituisce il suo testo esatto, e lo
   si ritrova nel sorgente. Il conteggio delle graffe resta solo per i sorgenti finti della prova al contrario. */
async function corpiDelKernelVero(sorgente, sostituti = {}) {
  const kernel = await import('../src/kernel/talosHarness.mjs');
  return DEFINIZIONI_DEI_CANCELLI.map((nome) => {
    const testo = sostituti[nome] ?? kernel[nome]?.toString?.() ?? '';
    const inizio = testo ? sorgente.indexOf(testo) : -1;
    assert.ok(inizio !== -1, `il cancello ${nome} non si ritrova nel sorgente: la prova non sa più dove finisce`);
    return [inizio, inizio + testo.length];
  });
}

export function cancelliSenzaChiamata(sorgente, corpi = corpiDeiCancelli(sorgente)) {
  const dentroUnCancello = (indice) => corpi.some(([da, a]) => indice > da && indice < a);
  return primiArgomentiDeiCancelli(sorgente).filter(({ argomento, indice }) => (argomento.startsWith('{')
    ? !/\btoolCallId\b/u.test(argomento)
    : !(PASSAGGI_DENTRO_I_CANCELLI.has(argomento) && dentroUnCancello(indice))));
}

const SORGENTE = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');

test('APPROVAZIONI-CHIAMATA-01 — ogni cancello del kernel costruisce la sua domanda con l\'id della chiamata', async () => {
  const tutti = primiArgomentiDeiCancelli(SORGENTE);
  /* al contrario: una scansione che non trova niente passa per costruzione — i cancelli sono decine (29/10: 40) */
  assert.ok(tutti.length >= 30, `trovati solo ${tutti.length} cancelli: la scansione non legge più il kernel`);
  const corpi = await corpiDelKernelVero(SORGENTE);
  assert.deepEqual(cancelliSenzaChiamata(SORGENTE, corpi).map(({ cancello, riga, argomento }) => `${cancello} :${riga} ${argomento.slice(0, 80)}`), []);
});

test('APPROVAZIONI-CHIAMATA-02 — AL CONTRARIO: un cancello scritto senza l\'id si vede, uno con l\'id no', () => {
  const finto = [
    "const a = await verificaPermessoConBarriera({ tipo: 'shell', comando }, opzioni)",
    "const b = await verificaPermessoConBarriera(\n  { tipo: 'scrivi', toolCallId: c.id, percorso },\n  opzioni)",
    'const d = chiediApprovazioneFn(qualcosaltro)',
    'export async function verificaAvvioAgente(azione, { coordinazione } = {}) {',
    '  const ok = chiediApprovazioneFn(azione)',
    '}',
    'export function unCancelloNuovo(azione) {',
    '  return chiediApprovazioneFn(azione)',
    '}',
    'function aiutoNascosto(azione, { chiediApprovazioneFn }) {',
    '  return chiediApprovazioneFn(azione)',
    '}',
    'export async function verificaAzioneAutomazione(azione, { chiediApprovazioneFn } = {}) {',
    '  return chiediApprovazioneFn(azione)',
    '}',
    'function aiutoSubitoDopo(azione, { chiediApprovazioneFn }) {',
    '  return chiediApprovazioneFn(azione)',
    '}',
  ].join('\n');
  /* riga 1: oggetto senza id; riga 5: un nome qualunque; riga 10: il passaggio FUORI da un cancello; riga 13: dentro una funzione NON
     esportata; riga 19: una funzione non esportata SUBITO DOPO un cancello, senza `export` in mezzo — la regola vecchia («fino al
     prossimo export») la contava dentro (terza verifica del blocco 19). Le righe 7 e 16 (dentro un cancello) passano. */
  assert.deepEqual(cancelliSenzaChiamata(finto).map(({ riga }) => riga), [1, 5, 10, 13, 19]);
});

test('APPROVAZIONI-CHIAMATA-03 — sul kernel vero il corpo di un cancello finisce dove finisce la funzione, anche con una graffa APERTA in una stringa del corpo', async () => {
  const kernel = await import('../src/kernel/talosHarness.mjs');
  const testo = kernel.verificaAzioneAutomazione.toString();
  /* una graffa aperta in una stringa DENTRO il corpo del cancello, e subito dopo il cancello un aiuto non esportato che passa l'azione:
     contando le graffe il corpo non si chiuderebbe e l'aiuto finirebbe «dentro»; preso dalla funzione stessa, l'aiuto si vede */
  const conGraffa = testo.replace(/\}\s*$/u, () => '    const _aperta = "{"\n}');
  const conAiuto = SORGENTE.replace(testo, () => `${conGraffa}\nfunction aiutoDopo(azione, { chiediApprovazioneFn } = {}) { return chiediApprovazioneFn(azione) }`);
  assert.notEqual(conAiuto, SORGENTE, 'la funzione del kernel non si ritrova nel sorgente');
  const corpi = await corpiDelKernelVero(conAiuto, { verificaAzioneAutomazione: conGraffa });
  const trovati = cancelliSenzaChiamata(conAiuto, corpi).map(({ riga }) => riga);
  const rigaAiuto = conAiuto.slice(0, conAiuto.indexOf('function aiutoDopo')).split('\n').length;
  assert.ok(trovati.includes(rigaAiuto), `l'aiuto dopo il cancello (riga ${rigaAiuto}) non è stato visto: ${JSON.stringify(trovati)}`);
});
