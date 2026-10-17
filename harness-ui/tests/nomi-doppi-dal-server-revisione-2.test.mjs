/*
 * 16/10/2026 (bugfixer) — seconda revisione di #45 (4a2ef8ec5): il «-N» contro tutte le sessioni in elenco, deleghe e giri compresi.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function modelloFinto() {
  const avvii = [];
  return {
    avvii,
    async avviaSessioneFn(input) {
      const indice = avvii.length + 1;
      let concludi;
      const attesa = new Promise((risolvi) => { concludi = risolvi; });
      avvii.push({ onDelega: input.onDelega, concludi: () => { input.onEvento({ type: 'RunFinished', threadId: `t${indice}`, runId: `r${indice}`, outcome: { type: 'success' } }); concludi({ ok: true, esito: { detto: 'fatto', comeFinita: 'concluso' } }); } });
      input.onEvento({ type: 'RunStarted', threadId: `t${indice}`, runId: `r${indice}` });
      return attesa;
    },
  };
}

test('NOMI2-REV-01 — [CURATO 16/10, era S4] il numero di una DELEGA conta le deleghe di TUTTE le conversazioni: la prima figlia di una chat nuova si chiama «…-2» perché un\'altra chat, giorni prima, ha delegato lo stesso compito', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'nomi2-rev-'));
  const finto = modelloFinto();
  t.after(() => { for (const a of finto.avvii) { try { a.concludi(); } catch { /* già */ } } rimuoviCartellaDiProva(cartella); });
  const registro = createSessionRegistry({
    avviaSessioneFn: finto.avviaSessioneFn, guardaWorkspaceFn: () => () => {}, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: null, task: { consegna, consegnaCorta: consegna } }),
  });
  const prima = registro.avviaLibero({ cartellaLibera: cartella, consegna: 'prima chat', permessi: 'Full access' });
  finto.avvii[0].onDelega('Controlla i test della cartella src');
  const seconda = registro.avviaLibero({ cartellaLibera: cartella, consegna: 'seconda chat, un altro giorno', permessi: 'Full access' });
  finto.avvii.at(-1).onDelega('Controlla i test della cartella src'); // avvii: prima chat, sua figlia, seconda chat
  const figlia = registro.elenca().find((s) => s.padreId === seconda.sessionId);
  assert.ok(figlia, 'premessa: la seconda chat ha la sua figlia');
  assert.equal(figlia.nome, 'Controlla i test della cartella src', `la figlia UNICA della seconda chat si chiama «${figlia.nome}»: \`nomeUnicoInElenco\` conta tutto l'archivio (\`sessioni\`), non le sorelle. Per le chat è la decisione dell'owner; per le deleghe il «-N» serve a distinguere le SORELLE (il client fa così, nomeDistintivo). Il numero cresce coi mesi`);
  void prima;
});

test('NOMI2-REV-02 — [CURATO 16/10, era S5] il confutatore del /goal («Goal refuter») prende nome e numero, e il numero cresce con TUTTI i confutatori della storia', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'nomi2-rev-b-'));
  const finto = modelloFinto();
  t.after(() => { for (const a of finto.avvii) { try { a.concludi(); } catch { /* già */ } } rimuoviCartellaDiProva(cartella); });
  const registro = createSessionRegistry({
    avviaSessioneFn: finto.avviaSessioneFn, guardaWorkspaceFn: () => () => {}, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: null, task: { consegna, consegnaCorta: consegna } }),
  });
  // tre deleghe col compito letterale del confutatore (session-registry.mjs:4772, consegnaCorta 'Goal refuter'), in tre chat
  for (let i = 0; i < 3; i += 1) {
    registro.avviaLibero({ cartellaLibera: cartella, consegna: `chat ${i}`, permessi: 'Full access' });
    finto.avvii.at(-1).onDelega('Goal refuter');
  }
  const nomi = registro.elenca().filter((s) => s.padreId).map((s) => s.nome);
  assert.deepEqual(nomi.filter((n) => /-\d+$/u.test(n ?? '')), [], `${JSON.stringify(nomi)} — un ruolo interno (\`confutatore:\`, senzaInterfaccia) non dovrebbe consumare numeri, né mostrarne`);
});
