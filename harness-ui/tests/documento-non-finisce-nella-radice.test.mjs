/*
 * ⛔⛔⛔ UN FILE GENERATO NON FINISCE MAI NELLA RADICE DEL DISCO.
 *
 * Nato l'11/09/2026 da un guasto arrivato all'owner con il modello vero, sessione `91ae0634`:
 *
 *   EPERM: operation not permitted, open 'C:\Qwen 3.8 - Metodi ingegneristici d'avanguardia.pdf'
 *
 * Il PDF si generava bene e passava la verifica: falliva SOLO la scrittura, e sempre alla radice
 * del disco. La catena, ricostruita sul `.jsonl` della sessione riga per riga:
 *  1. la sessione nasce su `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`, «Read only»,
 *     `cartellaGiaScelta:false` (intestazione, riga 1);
 *  2. l'owner alza il permesso a «Full access» (riga 2242, `tipo:"impostazioni-sessione"`);
 *  3. `aggiornaImpostazioni` ricalcola la cartella effettiva con `cartellaEffettivaPerPermessi`,
 *     che per «Full access» ritorna `parse(base).root` ⇒ `voce.cartella` diventa `C:\`. Da lì in
 *     poi OGNI `RunStarted` della sessione dichiara `contesto.cartella:"C:\\"` (righe 2411, 5250,
 *     5421, 7326, 11784, 20728 — sei giri);
 *  4. `document_create` scrive «alla radice del workspace» ⇒ `C:\<nome>.pdf`;
 *  5. Windows rifiuta con EPERM.
 *
 * ⛔ Il punto 5 NON è un caso sfortunato né un problema di nome: la radice del volume di sistema è
 *   protetta da ACL che lasciano al gruppo Users creare CARTELLE ma non FILE (WinTips.org, «FIX:
 *   Write Access Denied on Drive C:\», e Microsoft Learn «Access Control: Understanding Windows
 *   File And Registry Permissions», letti l'11/09/2026). ⇒ nessun titolo diverso poteva riuscire,
 *   e il consiglio «riprova con un altro nome» che il prodotto dava era falso.
 *
 * ⛔ La cura NON è restringere «Full access» — allargare il workspace È la funzione, e il modello
 *   deve poter leggere tutto il disco. È separare due domande che erano una sola: **da dove si
 *   legge** (il workspace effettivo) e **dove si DEPOSITA un file appena generato** (la cartella
 *   da cui la sessione è partita, `cartellaBase`, che la persona ha scelto e dove i permessi ci
 *   sono davvero). È `cartellaCreazioni` in `avviaSessione`.
 *
 * ⭐ Questo file prova la cura NEI DUE VERSI, come vuole la regola: che con la cura il file non
 *   vada nella radice, e — con la funzione VERA, non una finta — che nella radice non ci sarebbe
 *   mai potuto andare.
 */

import assert from 'node:assert/strict';
import { parse as parsePath } from 'node:path';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import { creaFileWorkspace } from '../src/workspace-files.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

const TASK = { consegna: 'Scrivi il documento', consegnaCorta: 'documento' };

/*
 * Un kernel finto che chiede UN documento e finisce — stessa forma del `talosLavoraFinto` di
 * `agent-service.test.mjs`: `onGiro` con la risposta, poi `onDocumento` con gli argomenti grezzi
 * come li manderebbe il modello, poi l'esito. Qui si misura il collegamento, non il kernel.
 */
function kernelCheChiedeUnDocumento() {
  return async (input) => {
    input.onGiro?.({ tipo: 'risposta', giro: 0, risposta: { role: 'assistant', content: 'ecco', tool_calls: [] } });
    await input.onDocumento?.({ format: 'pdf', title: 'Relazione', body: 'x' });
    return { comeFinita: 'concluso', detto: 'fatto' };
  };
}

const DOCUMENTO_FINTO = {
  generateTalosDocumentFn: async (spec) => ({
    format: spec.format,
    fileName: 'Relazione.pdf',
    mediaType: 'application/pdf',
    bytes: new TextEncoder().encode('%PDF-1.7 finto'),
  }),
  verifyTalosDocumentFn: async () => ({ ok: true, detail: '1 pagina' }),
};

test('⭐⭐⭐ il documento si deposita in `cartellaCreazioni`, non nella radice a cui «Full access» allarga il workspace', async () => {
  let cartellaRicevuta = null;
  const eventi = [];
  const risultato = await avviaSessione({
    cartella: 'C:/',
    cartellaCreazioni: 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop',
    task: TASK, modello: 'm', chiave: 'k',
    onEvento: (e) => eventi.push(e),
    talosLavoraFn: kernelCheChiedeUnDocumento(),
    ...DOCUMENTO_FINTO,
    creaFileWorkspaceFn: async ({ cartella, nome }) => { cartellaRicevuta = cartella; return { percorso: nome }; },
  });

  assert.equal(risultato.ok, true);
  assert.equal(
    cartellaRicevuta,
    'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop',
    'il file deve essere scritto nella cartella di PARTENZA della sessione, mai nella radice del disco',
  );
});

test('⛔ e il percorso mostrato nell’albero resta relativo al WORKSPACE — altrimenti punterebbe a un file che lì non c’è', async () => {
  const eventi = [];
  await avviaSessione({
    cartella: 'C:/',
    cartellaCreazioni: 'C:/Users/Antonino/Desktop/progetto',
    task: TASK, modello: 'm', chiave: 'k',
    onEvento: (e) => eventi.push(e),
    talosLavoraFn: kernelCheChiedeUnDocumento(),
    ...DOCUMENTO_FINTO,
    creaFileWorkspaceFn: async ({ nome }) => ({ percorso: nome }),
  });

  const scrittura = eventi.find((e) => e.type === 'StateDelta' && e.delta?.[0]?.path?.startsWith('/file/'));
  assert.ok(scrittura, 'la scrittura deve comunque essere annunciata');
  assert.equal(
    scrittura.delta[0].path,
    '/file/Users/Antonino/Desktop/progetto/Relazione.pdf',
    'il pannello File mostra percorsi relativi al workspace: col solo nome punterebbe alla radice, dove il file non esiste',
  );
});

test('⛔⛔ SENZA il parametro non cambia NIENTE: chi non passa `cartellaCreazioni` scrive dove scriveva prima', async () => {
  let cartellaRicevuta = null;
  const eventi = [];
  await avviaSessione({
    cartella: '/tmp/progetto',
    task: TASK, modello: 'm', chiave: 'k',
    onEvento: (e) => eventi.push(e),
    talosLavoraFn: kernelCheChiedeUnDocumento(),
    ...DOCUMENTO_FINTO,
    creaFileWorkspaceFn: async ({ cartella, nome }) => { cartellaRicevuta = cartella; return { percorso: nome }; },
  });

  assert.equal(cartellaRicevuta, '/tmp/progetto');
  const scrittura = eventi.find((e) => e.type === 'StateDelta' && e.delta?.[0]?.path?.startsWith('/file/'));
  assert.equal(scrittura.delta[0].path, '/file/Relazione.pdf', 'senza deposito separato il percorso resta il nome nudo');
});

test('⭐⭐⭐ il registro consegna `cartellaBase` come cartella di deposito, anche dopo che «Full access» ha allargato il workspace', async () => {
  const finta = sessioneSpia();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn,
    preparaEsecuzioneLiberaFn: (cartelleProgetto, { cartellaId, consegna }) => {
      const voce = cartelleProgetto.find((c) => c.id === cartellaId);
      return { cartella: voce.percorso, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } };
    },
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto', nome: 'progetto' }],
    modello: 'm', chiave: 'k',
  });

  const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'ciao', permessi: 'Read only' });
  await new Promise((r) => setImmediate(r));
  assert.equal(finta.ultimoInput.cartella, '/tmp/progetto');
  assert.equal(finta.ultimoInput.cartellaCreazioni, '/tmp/progetto', 'prima del cambio permesso le due coincidono');

  finta.concludi();
  await new Promise((r) => setImmediate(r));
  const esito = await registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' });
  assert.equal(esito.ok, true);

  registro.resume(sessionId, 'ora salvami il pdf');
  await new Promise((r) => setImmediate(r));
  assert.equal(
    finta.ultimoInput.cartella,
    parsePath('/tmp/progetto').root,
    'il workspace da cui si LEGGE si allarga davvero: è la funzione di «Full access», non va toccata',
  );
  assert.equal(
    finta.ultimoInput.cartellaCreazioni,
    '/tmp/progetto',
    '⛔ ma il deposito di un file generato resta la cartella scelta: è qui che la sessione 91ae0634 finiva su C:\\',
  );
});

/*
 * ⛔⛔⛔ IL VERSO CONTRARIO, con la funzione VERA e il disco VERO — non una finta.
 *
 * Senza questo, tutto il resto del file misurerebbe solo che un argomento viaggia da A a B. Qui si
 * prova la premessa: nella radice del disco un file NON si può creare. Se un giorno questa prova
 * diventasse verde (radice scrivibile), la cura sarebbe ancora giusta ma la sua urgenza sarebbe
 * un'altra cosa — e si vorrebbe saperlo.
 */
test('⛔⛔⛔ AL CONTRARIO — scrivere davvero nella radice del disco FALLISCE, e nessun nome diverso può salvarlo', { skip: process.platform !== 'win32' ? 'la prova riguarda le ACL della radice su Windows' : false }, async () => {
  const radice = parsePath(process.cwd()).root;
  let codice = null;
  let messaggio = '';
  try {
    await creaFileWorkspace({ cartella: radice, nome: `talos-cancello-${process.pid}.txt`, bytes: Buffer.from('x') });
  } catch (errore) {
    codice = errore?.code ?? null;
    messaggio = errore instanceof Error ? errore.message : String(errore);
  }
  assert.equal(codice, 'EPERM', `la radice del disco deve rifiutare un file nuovo — ricevuto invece: ${codice} ${messaggio}`);
});

/* La spia: cattura le opzioni passate ad avviaSessione senza far girare niente di vero. */
function sessioneSpia() {
  let risolvi = null;
  const spia = {
    ultimoInput: null,
    avviaSessioneFn: (input) => {
      spia.ultimoInput = input;
      input.onEvento?.({ type: 'RunStarted', threadId: 't', runId: 'r', input: input.task, contesto: {} });
      return new Promise((resolve) => { risolvi = resolve; });
    },
    concludi() {
      spia.ultimoInput.onEvento?.({ type: 'RunFinished' });
      risolvi?.({ ok: true, esito: { messaggiFinali: [{ role: 'user', content: 'ciao' }] } });
    },
  };
  return spia;
}
