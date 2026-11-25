/*
 * Riga 199 (PC 0.2.5, 22/11/2026) — due reperti vecchi dei revisori della cura di rete, nel controllo «Scrive nel progetto» della shell:
 *   4.1 la condivisione amministrativa di un ALTRO computer (`\\<altro>\C$\…`, anche col nome di questa macchina seguito da un dominio, o
 *       nella forma lunga `\\?\UNC\…`) si leggeva come il disco `C:` di questa macchina: dentro il progetto nessuna carta, e la scrittura
 *       andava all'altro computer;
 *   4.2 `\\\ospite\cond` con tre barre: Node lo legge `C:\ospite\cond`, ma cmd e PowerShell lo aprono sulla rete; la carta nominava `C:` e
 *       offriva «per la sessione».
 *   Ora sono bersagli di rete: la carta dice il computer, mai «per la sessione», e nessun tocco. Questa macchina (`\\localhost\C$`, il suo
 *   nome nudo) resta il disco locale come prima, e la carta critica di una cancellazione di `\\<altro>\C$\` resta.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { verificaPermessoScrittura } = await import('../src/kernel/talosHarness.mjs');
const { cancellazioneCritica, dimenticaPercorsiVeri } = await import('../src/kernel/cancellazioni-critiche.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { B, OSPITE } = S;

const suC = { skip: (process.platform !== 'win32' || !/^C:/iu.test(tmpdir())) && 'solo Windows, col profilo di prova su C:' };
function progetto(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-shell-'));
  mkdirSync(join(c, 'src'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
async function carte(c, comando) {
  const chieste = [];
  await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso: 'scrittura-progetto', cartella: c, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
  return chieste;
}

test('R199-4.1-4.2: la condivisione amministrativa di un altro computer e le tre barre sono la rete: carta del computer, mai «per la sessione», 0 tocchi', suC, async (t) => {
  const c = progetto(t);
  const dentro = c.slice(2); // `\T\finto…\talos-r199-shell-…`: lo stesso posto del progetto, sul `C$` di un altro computer
  const esterno = `${hostname()}.${OSPITE}.example`;
  S.azzera();
  const sbagli = [];
  for (const [nome, comando] of [
    ['nome col dominio', `copy a.txt ${B}${B}${esterno}${B}C$${dentro}${B}x.txt`],
    ['altro computer', `copy a.txt ${B}${B}${OSPITE}${B}C$${dentro}${B}x.txt`],
    ['altro, forma lunga', `copy a.txt ${B}${B}?${B}UNC${B}${OSPITE}${B}C$${dentro}${B}x.txt`],
    ['altro, barre in avanti', `cp a.txt //${OSPITE}/c$${dentro.replaceAll(B, '/')}/x.txt`],
    ['variabile', `$env:X='${B}${B}${esterno}${B}C$'; Set-Content "$env:X${dentro}${B}x.txt" y`],
    ['tre barre', `copy a.txt ${B}${B}${B}${OSPITE}${B}cond${B}x.txt`],
    ['tre barre in avanti', `powershell -Command "Set-Content '///${OSPITE}/cond/x.txt' y"`],
  ]) {
    const chieste = await carte(c, comando);
    const f = chieste[0]?.fuoriDalProgetto;
    if (chieste.length !== 1 || f?.fraseChiave !== 'server.approval.network.open' || f?.chiave !== undefined || f?.verificato !== false) {
      sbagli.push(`${nome} :: ${chieste.length} carte, ${f?.fraseChiave}, chiave ${f?.chiave === undefined ? 'no' : 'sì'}`);
    }
  }
  assert.deepEqual(S.elencoDeiTocchi(), [], 'nessun contatto con l ospite prima della carta');
  assert.deepEqual(sbagli, []);
});

test('R199-4.1-QUESTA: la condivisione amministrativa di QUESTA macchina resta il disco locale; la cancellazione di `\\\\<altro>\\C$\\` resta critica', suC, async (t) => {
  const c = progetto(t);
  const dentro = c.slice(2);
  S.azzera();
  for (const nome of ['localhost', hostname()]) {
    assert.deepEqual(await carte(c, `copy a.txt ${B}${B}${nome}${B}C$${dentro}${B}x.txt`), [], `\\\\${nome}\\C$ dentro il progetto: nessuna carta, come prima`);
  }
  for (const comando of [`rm -rf ${B}${B}${OSPITE}${B}C$${B}`, `Remove-Item -Recurse ${B}${B}${hostname()}.${OSPITE}.example${B}C$${B}Windows`]) {
    dimenticaPercorsiVeri();
    assert.ok(cancellazioneCritica(comando, { cartella: c }), `resta critica: ${comando}`);
  }
  assert.deepEqual(S.elencoDeiTocchi(), []);
});
