/*
 * Riga 199 (PC 0.2.5, 22/11/2026) — T8: GIÀ USCITO nella 0.2.3. Prima del cancello, un comando git che può nascondere o cancellare il
 *   lavoro della persona (`git -C <cartella> reset --hard`, `checkout --`, `clean -f`) faceva partire git con quella cartella come
 *   cartella di lavoro, per leggere lo stato del repository: con una cartella su un altro computer è il contatto SMB prima della carta,
 *   a ogni livello. Ora quella cartella non si legge e il comando si RIFIUTA, come quando lo stato non si legge (la protezione del
 *   lavoro non si perde: è un rifiuto in più, nei limiti noti). Col progetto che sta su quella condivisione la sonda parte come oggi.
 *   Le porte del disco e dei processi sono spiate (`aiuto/spia-di-rete-025.mjs`): l'ospite è inventato, nessun processo che cancella parte.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { talosLavora } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { B, OSPITE, NAS, unc } = S;

const solo = { skip: process.platform !== 'win32' && 'solo Windows: fuori da Windows `\\\\x` non è la rete' };
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });
async function giro(cartella, chiamate, extra) {
  let n = 0;
  const domande = [];
  const risultati = [];
  await talosLavora({
    cartella, task: { consegna: 'Prova.' }, modello: 'test', chiave: 'test',
    chiediApprovazioneFn: async (a) => { domande.push(a); return true; },
    onEvento: (e) => { if (e?.tipo === 'tool_result' || e?.tipo === 'risultato_attrezzo') risultati.push(e); },
    fetchDiRete: async (_u, init) => {
      if (n > 0) { const corpo = JSON.parse(init.body); risultati.push(JSON.stringify(corpo.messages?.at(-1)?.content ?? '')); }
      return { ok: true, status: 200, text: async () => '', json: async () => ({
        choices: [{ message: n++ === 0 ? { role: 'assistant', content: null, tool_calls: chiamate } : { role: 'assistant', content: 'Fatto.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }) };
    },
    ...extra,
  });
  return { domande, risultati };
}
function progetto(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-f4-'));
  mkdirSync(join(c, 'src'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const CARTELLE = [unc(OSPITE, 'cond', 'repo'), `//${OSPITE}/cond/repo`, `${B}${B}?${B}UNC${B}${OSPITE}${B}cond${B}repo`, unc(`${OSPITE}@SSL`, 'cond', 'repo')];
const COMANDI = (d) => [`git -C ${d} reset --hard`, `git -C "${d}" checkout -- .`, `git -C ${d} clean -fdx`];
const LIVELLI = [['accesso-pieno', undefined], ['scrittura-progetto', { shell: 'sempre' }], ['su-richiesta', { shell: 'sempre' }]];

test('R199-T8: git che può toccare il lavoro su una cartella di un altro computer non la apre prima della carta, ed è rifiutato', solo, async (t) => {
  const c = progetto(t);
  S.azzera();
  const partiti = [];
  const senzaMotivo = [];
  for (const d of CARTELLE) {
    for (const comando of COMANDI(d)) {
      for (const [livelloAccesso, permessiPerAttrezzo] of LIVELLI) {
        const prima = S.distruttivi.length + S.eseguiti.length;
        const { risultati } = await giro(c, [chiama('g', 'shell', { comando })], { livelloAccesso, ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}) });
        if (S.distruttivi.length + S.eseguiti.length > prima) partiti.push(`${livelloAccesso} :: ${comando}`);
        if (!risultati.join('\n').includes('another computer')) senzaMotivo.push(`${livelloAccesso} :: ${comando}`);
      }
    }
  }
  t.diagnostic(`tocchi: ${S.tocchi.length}; partiti: ${partiti.length}`);
  assert.deepEqual(S.elencoDeiTocchi(), [], 'nessun contatto con l ospite prima della carta');
  assert.deepEqual(partiti, [], 'il comando non parte: lo stato di quella cartella non si legge, quindi si rifiuta');
  assert.deepEqual(senzaMotivo, [], 'il rifiuto dice che la cartella è su un altro computer');
});

test('R199-T8-CONTROPROVA: col progetto su una condivisione, la sonda parte come oggi', solo, async () => {
  const c = unc(NAS, 'lavoro', 'repo');
  S.azzera();
  await giro(c, [chiama('g', 'shell', { comando: 'git reset --hard' })], { livelloAccesso: 'accesso-pieno' });
  assert.ok(S.delNas.some((p) => /\(cwd\)/u.test(p)), 'la sonda di git parte nella cartella del progetto, come oggi');
  assert.deepEqual(S.elencoDeiTocchi(), []);
});
