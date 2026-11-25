/*
 * Riga 199, giro unico (punto 1; reperti A-R1, C-L1) — PUNTI E SPAZI IN CODA AI PEZZI DOPO `\\.\`. Win32 normalizza i percorsi `\\.\`
 *   e toglie punti e spazi in coda ai pezzi: `\\.\UNC.\H\c` apre `\??\UNC\H\c`. `portaInRete` confrontava le parole chiave (`UNC`,
 *   `GLOBALROOT`, `Mup`…) senza togliere le code, e le diceva «locale»: un tocco vero prima della carta in T5-T10. Si usa il modello
 *   LARGO (punti e spazi da OGNI pezzo, come `senzaCodeDiWindows` di path-policy), anche dopo `\\?\` dove è innocuo. Spia chiusa.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { portaInRete } = await import('../src/kernel/file-namespace-contract.mjs');
const { ePercorsoDiControllo, scritturaDiUnaCredenziale, bloccataDa } = await import('../src/path-policy.mjs');
const { cancellazioneCritica, dimenticaPercorsiVeri } = await import('../src/kernel/cancellazioni-critiche.mjs');
const { verificaPermessoScrittura } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { B, OSPITE } = S;

const solo = { skip: process.platform !== 'win32' && 'solo Windows' };
const CODE = ['.', '..', '...', ' ', '  ', '. ', ' .', '.. ', ' . '];
const FAMIGLIE = [['UNC'], ['GLOBALROOT', 'Device', 'Mup'], ['GLOBAL', 'UNC'], ['GLOBALROOT', '??', 'UNC'], ['GLOBALROOT', 'DosDevices', 'UNC'],
  ['GLOBAL', 'GLOBALROOT', 'GLOBAL??', 'UNC'], ['GLOBALROOT', 'Device', 'LanmanRedirector'], ['GLOBALROOT', 'Device', 'WebDavRedirector'], ['GLOBALROOT', 'Device', 'RdpDr']];
/* ogni famiglia, ogni pezzo parola chiave con ogni coda, dopo `\\.\` e `//./` */
const FORME = [];
for (const pref of [`${B}${B}.${B}`, '//./']) {
  for (const f of FAMIGLIE) {
    for (let i = 0; i < f.length; i += 1) for (const coda of CODE) FORME.push(`${pref}${f.map((p, k) => (k === i ? p + coda : p)).join(B)}${B}${OSPITE}${B}cond`);
  }
}

test('R199-CODE-F: ogni forma con punti o spazi in coda a una parola chiave porta alla rete', solo, () => {
  const locali = FORME.filter((p) => portaInRete(p, { platform: 'win32' }) === null);
  assert.deepEqual(locali.slice(0, 8), [], `${locali.length} forme su ${FORME.length} dette «locali»`);
  /* il verso opposto: questa macchina e i dischi locali con le code restano locali */
  for (const p of [`${B}${B}.${B}C:.${B}x`, `${B}${B}.${B}UNC${B}localhost${B}C$`, `${B}${B}.${B}GLOBALROOT.${B}Device${B}HarddiskVolume3${B}x`]) assert.equal(portaInRete(p, { platform: 'win32' }), null, p);
});

test('R199-CODE-T: T5, T9, T10 e T7 non toccano l ospite su queste forme', solo, async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-code-'));
  mkdirSync(join(c, 'src'));
  t.after(() => rimuoviCartellaDiProva(c));
  S.azzera();
  const per = { t5: 0, t9: 0, t10: 0, t7: 0, p: 0 };
  const conta = (k, fn) => { const prima = S.tocchi.length; fn(); per[k] += S.tocchi.length - prima; };
  for (const p of FORME) {
    conta('t5', () => ePercorsoDiControllo(c, `${p}${B}.talos${B}hooks.json`));
    conta('t9', () => bloccataDa(`${p}${B}a.txt`, { cartella: c, bloccati: [join(c, 'src')] }));
    conta('t10', () => scritturaDiUnaCredenziale(`${p}${B}.ssh${B}id_rsa`, { cartella: c }));
    conta('t7', () => { dimenticaPercorsiVeri(); cancellazioneCritica(`Remove-Item -Recurse ${p}${B}x`, { cartella: c }); });
  }
  for (const p of FORME.slice(0, 30)) {
    const prima = S.tocchi.length;
    await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando: `Remove-Item -Recurse ${p}${B}x` }, { livelloAccesso: 'accesso-pieno', cartella: c, consensiSessione: {}, chiediApprovazioneFn: async () => false });
    per.p += S.tocchi.length - prima;
  }
  t.diagnostic(`forme ${FORME.length}; tocchi ${JSON.stringify(per)}`);
  assert.deepEqual(S.elencoDeiTocchi().slice(0, 5), [], 'nessun contatto con l ospite prima della carta');
});
