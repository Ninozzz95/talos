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

import { t, tn } from './lingua.js';

/** Il comando che crea un utente normale nella distro, da un terminale di Windows (Microsoft Learn, «Basic commands for WSL»). */
export function comandoPerCreareUtente(distro) {
  return `wsl -d ${distro} -u root adduser ${t('varie.wsl.user.placeholder')}`; // il segnaposto da sostituire si legge nella lingua della persona
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
    ? t('varie.wsl.user.runsAs', { user: wsl.utenteUsato, distro })
    : t('varie.wsl.user.unverified', { distro });

  const montaggi = Array.isArray(wsl.montaggi) ? wsl.montaggi.filter((m) => typeof m?.montaggio === 'string') : [];
  let dischi;
  /* 03/10/2026: frasi intere per ogni caso (una frase a pezzi non regge in un'altra lingua); il numero dei dischi lo sceglie `tn`. */
  if (montaggi.length === 0) {
    dischi = t('varie.wsl.disks.default');
  } else {
    const nomi = montaggi.map((m) => m.montaggio).join(', ');
    const senzaPermessi = montaggi.filter((m) => m.metadata === false).map((m) => m.montaggio);
    dischi = senzaPermessi.length === 0 ? tn('varie.wsl.disks.one', 'varie.wsl.disks.many', montaggi.length, { disks: nomi })
      : senzaPermessi.length === montaggi.length ? tn('varie.wsl.disks.oneNoPermissions', 'varie.wsl.disks.manyNoPermissions', montaggi.length, { disks: nomi })
        : t('varie.wsl.disks.someNoPermissions', { disks: nomi, without: senzaPermessi.join(', ') });
  }
  /* Con root, l'altra metà della decisione: un comando che nessuno approva chiede conferma una volta per sessione. Detta qui perché la
     carta che la chiede non arrivi come una sorpresa. Se l'utente non è verificato vale lo stesso (il kernel chiede). */
  if (wsl.root !== false) dischi += ` ${t('varie.wsl.disks.rootAsks')}`;

  let nota = t('varie.wsl.note.allSessions');
  let comando = null;
  if (wsl.predefinitoRoot === false) {
    nota += ` ${t('varie.wsl.note.defaultNotRoot', { distro })}`;
  } else if (typeof wsl.utenteNormale === 'string' && wsl.utenteNormale) {
    nota += ` ${acceso ? t('varie.wsl.note.useUser', { user: wsl.utenteNormale }) : t('varie.wsl.note.offRoot', { user: wsl.utenteNormale })}`;
  } else if (wsl.predefinitoRoot === true) {
    nota += ` ${t('varie.wsl.note.noUser', { distro })}`;
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
      badge: t('varie.wsl.home.automaticBadge'),
      sub: t('varie.wsl.home.automaticSub'),
    },
    linux: {
      sub: t('varie.wsl.home.linuxSub'),
    },
  };
}
