/*
 * ⛔⛔ F009 (owner 01/10/2026) — I TESTI DEL BLOCCO «CON CHE UTENTE GIRANO I COMANDI IN LINUX», nel velo dei permessi.
 *
 * Decisioni: «come gli altri, insieme» (dichiararlo sempre; usare l'utente normale della distro se c'è; un comando da root
 * che nessuno approva = una conferma per sessione, «ogni volta che nessuno è interpellato»), «esito e foglio della shell», interruttore «nel foglio, sotto la riga», «accesa» di
 * partenza. TALOS non crea utenti: se la distro non ne ha uno, il blocco dice il comando per crearlo.
 *
 * Pura: riceve ciò che risponde `GET /api/v1/wsl` (`{ preferenze, wsl }`, vedi `preferenze-wsl-store.mjs` e `statoWsl` nel
 * kernel) e restituisce le frasi; chi disegna le mette con `textContent`. Un dato che manca non si inventa: senza WSL il
 * blocco non si mostra, e un utente che la sonda non ha saputo dire si dichiara «non verificato».
 */

/** Il comando che crea un utente normale nella distro, da un terminale di Windows (Microsoft Learn, «Basic commands for WSL»). */
export function comandoPerCreareUtente(distro) {
  return `wsl -d ${distro} -u root adduser <nome>`;
}

/**
 * @param {{preferenze?: {usaUtenteNormale?: boolean}, wsl?: object}|null} dati
 * @returns {{visibile: false} | {visibile: true, chi: string, dischi: string, nota: string, comando: string|null, acceso: boolean}}
 */
export function testiUtenteWsl(dati) {
  const wsl = dati?.wsl;
  if (!wsl || wsl.disponibile !== true || typeof wsl.distro !== 'string' || wsl.distro === '') return { visibile: false };
  const distro = wsl.distro;
  const acceso = dati?.preferenze?.usaUtenteNormale !== false;
  const chi = typeof wsl.utenteUsato === 'string' && wsl.utenteUsato
    ? `In Linux i comandi girano come ${wsl.utenteUsato} (${distro})`
    : `In Linux non è stato possibile verificare con che utente girano i comandi (${distro})`;

  const montaggi = Array.isArray(wsl.montaggi) ? wsl.montaggi.filter((m) => typeof m?.montaggio === 'string') : [];
  let dischi;
  if (montaggi.length === 0) {
    dischi = 'I dischi di Windows sono in /mnt: nessun isolamento.';
  } else {
    const nomi = montaggi.map((m) => m.montaggio).join(', ');
    const soggetto = montaggi.length === 1 ? `${nomi} è il disco di Windows` : `${nomi} sono i dischi di Windows`;
    const senzaPermessi = montaggi.filter((m) => m.metadata === false).map((m) => m.montaggio);
    const permessi = senzaPermessi.length === 0 ? ''
      : senzaPermessi.length === montaggi.length ? ', e lì i permessi Linux non valgono'
        : `; su ${senzaPermessi.join(', ')} i permessi Linux non valgono`;
    dischi = `${soggetto}: nessun isolamento${permessi}.`;
  }
  /* Con root, l'altra metà della decisione: un comando che nessuno approva chiede conferma una volta per sessione. Detta qui perché la
     carta che la chiede non arrivi come una sorpresa. Se l'utente non è verificato vale lo stesso (il kernel chiede). */
  if (wsl.root !== false) dischi += ' Se un comando gira come root senza la tua approvazione, TALOS te lo chiede una volta per sessione.';

  let nota = 'Vale per tutte le sessioni.';
  let comando = null;
  if (wsl.predefinitoRoot === false) {
    nota += ` In ${distro} l’utente predefinito non è root: non cambia niente.`;
  } else if (typeof wsl.utenteNormale === 'string' && wsl.utenteNormale) {
    nota += acceso ? ` Usa ${wsl.utenteNormale} al posto di root.` : ` Spento: i comandi girano come root anche se c’è ${wsl.utenteNormale}.`;
  } else if (wsl.predefinitoRoot === true) {
    nota += ` ${distro} non ne ha uno. Per crearlo, da un terminale di Windows:`;
    comando = comandoPerCreareUtente(distro);
  }
  return { visibile: true, chi, dischi, nota, comando, acceso };
}

/*
 * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026, «anche Automatico») — con la casa Linux pronta (`wsl.casaLinux.pronta`,
 *   i binari per Linux del pacchetto) e WSL presente, «Automatico» non sceglie più comando per comando: è Linux per tutta la
 *   sessione, e gli attrezzi dei file lavorano nello stesso Linux della shell. Le scelte lo devono dire, o il foglio
 *   descriverebbe un comportamento che non c'è più («Come prima», «può cambiare da un comando all'altro»).
 * Senza casa (binari mancanti, WSL assente, o nessuna risposta) ⇒ `null`: restano i testi del template, che sono veri.
 * @returns {null | {automatico: {badge: string, sub: string}, linux: {sub: string}}}
 */
export function testiDoveGiranoIComandi(dati) {
  const wsl = dati?.wsl;
  if (!wsl || wsl.disponibile !== true || wsl.casaLinux?.pronta !== true) return null;
  return {
    automatico: {
      badge: 'Linux con WSL',
      sub: 'Una casa sola: con WSL comandi e attrezzi dei file lavorano in Linux, senza WSL su Windows.',
    },
    linux: {
      sub: 'Sempre in Linux, comandi e attrezzi dei file con gli stessi percorsi. Se WSL non c’è, il comando lo dice invece di ripiegare in silenzio.',
    },
  };
}
