import { randomBytes } from 'node:crypto';
import { closeSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ⛔⛔ 70-A (30/09/2026, contratto desktop 70) — il segreto del server del Codice.
 *
 * Misurato con la sonda del 30/09: un'altra app o una pagina web sul telefono avviava una sessione sulla 4174 senza
 * nessun segreto. Owner, 30/09 sera: «Lo crea il server». Il server gira come `shell` e sopravvive all'app (PPID 1):
 * il segreto nasce qui a ogni avvio e si scrive in un file leggibile solo da lui; l'app lo legge dal ponte adb
 * (`TalosTerminalPlugin.leggiSegretoServer`). Così combacia sempre col server in corso. Stesso schema del lock file di
 * Claude Code (correzione della CVE-2025-52882) e del file di runtime di Jupyter Server; ledger
 * `.claude/ragionamento/LEDGER-70A-SERVER-CODICE-PROTETTO-2026-09-30.md`.
 *
 * ⛔ Il segreto non si stampa mai: né nel log del server né in un messaggio d'errore.
 */

/** ⛔ Lo stesso nome sta in `TalosTerminalPlugin.kt` (`FILE_SEGRETO_REMOTO`): lo verifica SEC70-NOME-01. */
export const NOME_FILE_SEGRETO = 'server-token';

const TENTATIVI_NOME_TEMPORANEO = 4;

/** 64 caratteri esadecimali minuscoli: 32 byte casuali. */
export function segretoValido(testo) {
  return typeof testo === 'string' && /^[0-9a-f]{64}$/.test(testo);
}

/**
 * Genera il segreto, lo scrive in `<cartella>/server-token` (modo 0600) e lo restituisce.
 *
 * Il file passa da un nome temporaneo aperto con `wx` (O_CREAT|O_EXCL: se il nome esiste già, anche come link, la
 * creazione fallisce e non lo segue), poi `rename` sul nome finale, atomico sullo stesso file system. Il suffisso del
 * nome temporaneo viene da un'estrazione a parte, mai da un pezzo del segreto. Se il nome è sempre occupato il server
 * rinuncia: meglio un Codice che non parte di un segreto scritto in un file preparato da altri.
 */
export function creaSegretoServer({ cartella, randomBytesFn = randomBytes }) {
  const segreto = Buffer.from(randomBytesFn(32)).toString('hex');
  const finale = join(cartella, NOME_FILE_SEGRETO);
  for (let tentativo = 0; tentativo < TENTATIVI_NOME_TEMPORANEO; tentativo += 1) {
    const temporaneo = join(cartella, `${NOME_FILE_SEGRETO}.${Buffer.from(randomBytesFn(8)).toString('hex')}.tmp`);
    let descrittore;
    try {
      descrittore = openSync(temporaneo, 'wx', 0o600);
    } catch (errore) {
      if (errore?.code === 'EEXIST') continue;
      throw new Error(`segreto del server non scrivibile (${errore?.code ?? 'errore'})`);
    }
    try {
      writeSync(descrittore, segreto);
    } catch (errore) {
      closeSync(descrittore);
      unlinkSync(temporaneo);
      throw new Error(`segreto del server non scrivibile (${errore?.code ?? 'errore'})`);
    }
    closeSync(descrittore);
    renameSync(temporaneo, finale);
    return segreto;
  }
  throw new Error('segreto del server non scrivibile: nome temporaneo sempre occupato');
}
