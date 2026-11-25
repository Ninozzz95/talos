/*
 * Riga 199, giro unico (punto 3; reperti C-R1/R2, A-R2; vecchi) — DOPO `cd`, `pushd` o `Set-Location` verso un altro computer, i bersagli
 *   relativi stanno su quel computer. 4.1/4.2 chiudevano solo il bersaglio scritto per intero: `Set-Location \\<altro>\C$\<progetto>;
 *   Copy-Item a.txt x.txt` passava senza carta in «Scrive nel progetto», `cd \\\h\c; Set-Content x.txt y` dava una carta su `C:` con «per
 *   la sessione»; in Accesso pieno `Set-Location \\\h\cond; Remove-Item -Recurse x` passava, mentre con due barre è critica.
 *   Spia chiusa, ospite inventato.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { verificaPermessoScrittura } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { B, OSPITE } = S;

const suC = { skip: (process.platform !== 'win32' || !/^C:/iu.test(tmpdir())) && 'solo Windows, col profilo di prova su C:' };
async function carte(c, comando, livelloAccesso) {
  const chieste = [];
  const r = await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso, cartella: c, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
  return { passa: r?.consentito !== false, chieste };
}

test('R199-CD: dopo cd/pushd/Set-Location verso un altro computer la scrittura relativa chiede con la carta di rete, mai «per la sessione»', suC, async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-cd-'));
  mkdirSync(join(c, 'src'));
  t.after(() => rimuoviCartellaDiProva(c));
  const dentro = c.slice(2);
  const esterno = `${hostname()}.${OSPITE}.example`;
  S.azzera();
  const sbagli = [];
  for (const [nome, comando] of [
    ['Set-Location C$ di un altro', `Set-Location ${B}${B}${OSPITE}${B}C$${dentro}; Copy-Item a.txt x.txt`],
    ['cd nome col dominio', `cd ${B}${B}${esterno}${B}C$${dentro}; Set-Content x.txt y`],
    ['pushd C$ di un altro', `pushd ${B}${B}${OSPITE}${B}C$${dentro} && copy a.txt x.txt`],
    ['Set-Location forma lunga', `Set-Location ${B}${B}?${B}UNC${B}${OSPITE}${B}C$${dentro}; Copy-Item a.txt x.txt`],
    ['cd tre barre', `cd ${B}${B}${B}${OSPITE}${B}cond; Set-Content x.txt y`],
    ['pushd tre barre', `pushd ${B}${B}${B}${OSPITE}${B}cond && copy a.txt x.txt`], // con un `&` solo vale la regola di bash del sottofondo (limite noto)
    ['Set-Location fornitore', `Set-Location FileSystem::${B}${B}${OSPITE}${B}cond; Set-Content x.txt y`],
  ]) {
    const { chieste } = await carte(c, comando, 'scrittura-progetto');
    const f = chieste[0]?.fuoriDalProgetto;
    if (chieste.length !== 1 || f?.fraseChiave !== 'server.approval.network.open' || f?.chiave !== undefined) sbagli.push(`${nome} :: ${chieste.length} carte, ${f?.fraseChiave}, sessione ${f?.chiave !== undefined}`);
  }
  /* in Accesso pieno, dopo le tre barre, la cancellazione ricorsiva è critica come con due barre */
  for (const comando of [`Set-Location ${B}${B}${B}${OSPITE}${B}cond; Remove-Item -Recurse x`, `cd ${B}${B}${OSPITE}${B}cond; Remove-Item -Recurse x`]) {
    const { passa, chieste } = await carte(c, comando, 'accesso-pieno');
    if (passa || !chieste.some((a) => a.cancellazioneCritica)) sbagli.push(`P :: ${comando}`);
  }
  /* controprova: questa macchina resta il disco locale (dentro il progetto nessuna carta) */
  if ((await carte(c, `Set-Location ${B}${B}localhost${B}C$${dentro}; Copy-Item a.txt x.txt`, 'scrittura-progetto')).chieste.length !== 0) sbagli.push('localhost: una carta in più');
  assert.deepEqual(S.elencoDeiTocchi(), []);
  assert.deepEqual(sbagli, []);
});
