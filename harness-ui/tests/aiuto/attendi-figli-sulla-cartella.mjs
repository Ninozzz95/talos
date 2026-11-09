/*
 * Aspetta che nessun processo figlio di QUESTO processo lavori ancora su una cartella di prova, poi torna.
 *
 * Perché esiste (regola 6 del metodo: una prova che cade sotto carico si cura una volta, aspettando l'evento vero, mai un tempo
 * più lungo). Il giro del kernel prepara il riassunto IN SOTTOFONDO (talosHarness.desktop-hotfix.mjs, `bloccoFattiPer` →
 * `costruisciBloccoFatti`) e per scelta non lo aspetta: appena il giro è finito può esserci ancora un
 * `git -C <cartella di prova> log --oneline -5` vivo. Misurato con una sonda su d-freno-23-10 il 03/11/2026: 7 pulizie su 23 lo
 * trovavano vivo sulla loro cartella. Su Windows una cartella aperta da un processo vivo non sparisce finché l'ultimo handle non si
 * chiude (RemoveDirectoryW, «the directory is not removed until the last handle to the directory is closed», learn.microsoft.com,
 * letto il 03/11/2026), e `rmSync` su EPERM non ritenta: sotto carico git vive più a lungo dei ritentativi e la prova diventa rossa
 * per la pulizia, non per il prodotto.
 *
 * Nata il 30/10/2026 dentro cli-revisione-613-3-residui-22-10.test.mjs (S2-2-CONTA-01), portata qui il 03/11/2026 perché d-freno-23-10
 * ha la stessa causa. Hermes, nello stesso caso (prove del riassunto con git in una cartella temporanea), inghiotte l'errore della
 * pulizia: `shutil.rmtree(tmp, ignore_errors=True)` (hermes-agent 2026-11-01, tests/agent/test_compaction_prompt_rebuild.py:142).
 * Qui no: si aspetta il figlio, con un tetto; se dopo il tetto è ancora vivo la rimozione fallisce e la prova resta rossa, che è la
 * notizia giusta (un figlio che non finisce più).
 */
export async function attendiFigliSullaCartella(cartella, { tettoMs = 15_000 } = {}) {
  const vivi = () => process._getActiveHandles().filter((h) => h?.constructor?.name === 'ChildProcess'
    && (h.spawnargs ?? []).some((a) => String(a).includes(cartella)) && h.exitCode === null && h.signalCode === null);
  const fine = Date.now() + tettoMs;
  while (vivi().length > 0 && Date.now() < fine) await new Promise((r) => { setTimeout(r, 20); });
}
