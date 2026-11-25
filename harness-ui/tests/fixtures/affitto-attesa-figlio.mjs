/*
 * 14/11/2026 — un TALOS VERO in un processo a parte per `affitto-attesa-su-disco.test.mjs` (sesto giro dell'affitto, giudice v1888).
 *   rifiuta <store> <righe> <pid dell altro>: un giro finto, poi l'altro TALOS (vivo) tiene la chat e arrivano <righe> righe tardive:
 *     vanno nel file di attesa; il processo si chiude di colpo (SIGKILL: nessun gestore di uscita gira) appena lo dice.
 *   adotta <store> <sessionId> <ms>: riapre l'archivio, ripristina e aspetta (al massimo <ms>) che le righe in attesa siano adottate;
 *     stampa una riga JSON con le righe con `_attesa` che ha consegnato a chi ascolta e quelle che restano in attesa.
 *   Solo la cartella che gli passa la prova (nel TEMP finto); nessuna cancellazione.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { affittiDellArchivio, attendiScritture, attivaAffittiArchivio } from '../../src/session-store.mjs';
import { createSessionRegistry } from '../../src/session-registry.mjs';
import { CARTELLA_AFFITTI } from '../../src/session-lease.mjs';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const [modo, store, ...resto] = process.argv.slice(2);

function registroDi(stato, { ritentaCodaAffittataMs = 5_000 } = {}) {
  return createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: `figlio ${process.pid}` }, guardaWorkspaceFn: () => () => {}, ritentaCodaAffittataMs,
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      if (!stato) return { ok: true, esito: { detto: 'x', comeFinita: 'concluso' } };
      while (!stato.sessionId) await pausa(5);
      stato.onEvento = input.onEvento;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      input.onEvento({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
      input.onEvento({ type: 'TextMessageContent', messageId: 'm1', delta: 'g1 ' });
      input.onEvento({ type: 'TextMessageEnd', messageId: 'm1' });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      stato.fine?.();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Fatto.' }] } };
    },
  });
}

if (modo === 'rifiuta') {
  const [righe, pidAltro] = resto.map(Number);
  attivaAffittiArchivio(store, { etichetta: 'figlio', battitoMs: 0, rilascioDopoMs: 0 });
  const stato = { sessionId: null, onEvento: null };
  const giro = new Promise((ok) => { stato.fine = ok; });
  const registro = registroDi(stato);
  const lavoro = mkdtempSync(join(tmpdir(), 'atf-'));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  stato.sessionId = sessionId;
  await giro;
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  affittiDellArchivio(store).rilascia(sessionId);
  mkdirSync(join(store, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(join(store, CARTELLA_AFFITTI, `${sessionId}.json`), JSON.stringify({ istanza: '99999999-9999-4999-8999-999999999999', pid: pidAltro, host: hostname(), avviatoIl: '2026-11-14T08:00:00.000Z', presoIl: '2026-11-14T08:01:00.000Z', etichetta: 'the other TALOS' }));
  for (let i = 1; i <= righe; i += 1) await stato.onEvento({ type: 'CUSTOM', name: 'talos.tardivo', value: { id: `tardivo-${i}` } });
  process.stdout.write(`PRONTO ${JSON.stringify({ sessionId, inAttesa: registro.righeInAttesa(sessionId).length })}\n`, () => process.kill(process.pid, 'SIGKILL'));
} else if (modo === 'adotta') {
  const [sessionId, ms] = [resto[0], Number(resto[1])];
  attivaAffittiArchivio(store, { etichetta: 'figlio', battitoMs: 50, rilascioDopoMs: 100 });
  const registro = registroDi(null, { ritentaCodaAffittataMs: 20 });
  await registro.ripristina();
  const consegnate = [];
  registro.iscriviti(sessionId, (e) => { if (typeof e?._attesa === 'string') consegnate.push(`${e.value?.id}:${e._sequenza}`); }, 0);
  const fine = Date.now() + ms;
  while (registro.righeInAttesa(sessionId).length > 0 && Date.now() < fine) await pausa(10);
  await pausa(150); // il rilascio dell'affitto (100 ms) e un ritento dell'altro processo
  const restano = registro.righeInAttesa(sessionId).length;
  await registro.chiudi({ attesaMassimaMs: 1000 });
  process.stdout.write(`ESITO ${JSON.stringify({ pid: process.pid, consegnate, restano })}\n`);
  process.exit(0);
} else {
  process.stderr.write(`modo sconosciuto: ${modo}\n`);
  process.exit(2);
}
