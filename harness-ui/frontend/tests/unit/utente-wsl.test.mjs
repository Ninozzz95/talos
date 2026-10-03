/*
 * ⛔⛔ F009 (owner 01/10/2026, «esito e foglio della shell», interruttore «nel foglio, sotto la riga») — i testi del blocco
 *   «con che utente girano i comandi in Linux» e il «dove» dell'esito. Le forme d'ingresso sono quelle VERE: lo stato misurato
 *   il 01/10/2026 sulla macchina dell'owner (Ubuntu, root, nessun utente normale, C: e D: senza metadata) e l'etichetta che il
 *   kernel scrive davvero (`etichettaSandbox` coi dettagli).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { testiUtenteWsl, comandoPerCreareUtente, testiDoveGiranoIComandi } from '../../src/components/utente-wsl.js';
import { dovEGirato, leggiEsitoComando, rigaDiStatoComando } from '../../src/components/esito-comando.js';

const STATO_VERO = {
  preferenze: { usaUtenteNormale: true },
  wsl: { disponibile: true, distro: 'Ubuntu', utentePredefinito: 'root', predefinitoRoot: true, utenteNormale: null, utenteUsato: 'root', root: true,
    montaggi: [{ montaggio: '/mnt/c', metadata: false }, { montaggio: '/mnt/d', metadata: false }] },
};

test('WSL-T-01: la macchina dell owner — root, dischi senza permessi Linux, e come creare un utente normale', () => {
  const t = testiUtenteWsl(STATO_VERO);
  assert.equal(t.visibile, true);
  assert.equal(t.chi, 'In Linux i comandi girano come root (Ubuntu)');
  assert.equal(t.dischi, '/mnt/c, /mnt/d sono i dischi di Windows: nessun isolamento, e lì i permessi Linux non valgono. Se un comando gira come root senza la tua approvazione, TALOS te lo chiede una volta per sessione.');
  assert.equal(t.nota, 'Vale per tutte le sessioni. Ubuntu non ne ha uno. Per crearlo, da un terminale di Windows:');
  assert.equal(t.comando, 'wsl -d Ubuntu -u root adduser <nome>');
  assert.equal(t.acceso, true);
});

test('WSL-T-02: con un utente normale e l interruttore acceso si usa lui; spento si dice che resta root', () => {
  const conMario = { preferenze: { usaUtenteNormale: true }, wsl: { ...STATO_VERO.wsl, utenteNormale: 'mario', utenteUsato: 'mario', root: false } };
  const acceso = testiUtenteWsl(conMario);
  assert.equal(acceso.chi, 'In Linux i comandi girano come mario (Ubuntu)');
  assert.equal(acceso.nota, 'Vale per tutte le sessioni. Usa mario al posto di root.');
  assert.doesNotMatch(acceso.dischi, /una volta per sessione/, 'senza root non c è conferma da annunciare');
  assert.equal(acceso.comando, null);
  const spento = testiUtenteWsl({ preferenze: { usaUtenteNormale: false }, wsl: { ...conMario.wsl, utenteUsato: 'root', root: true } });
  assert.equal(spento.acceso, false);
  assert.equal(spento.nota, 'Vale per tutte le sessioni. Spento: i comandi girano come root anche se c’è mario.');
  assert.match(spento.dischi, /te lo chiede una volta per sessione/);
});

test('WSL-T-03: un dato che manca non si inventa', () => {
  assert.deepEqual(testiUtenteWsl(null), { visibile: false });
  assert.deepEqual(testiUtenteWsl({ wsl: { disponibile: false } }), { visibile: false });
  const muto = testiUtenteWsl({ preferenze: {}, wsl: { disponibile: true, distro: 'Ubuntu', utenteUsato: null, root: null, predefinitoRoot: null, montaggi: [] } });
  assert.equal(muto.chi, 'In Linux non è stato possibile verificare con che utente girano i comandi (Ubuntu)');
  assert.equal(muto.dischi, 'I dischi di Windows sono in /mnt: nessun isolamento. Se un comando gira come root senza la tua approvazione, TALOS te lo chiede una volta per sessione.');
  assert.equal(muto.nota, 'Vale per tutte le sessioni.');
  assert.equal(muto.acceso, true, 'senza preferenza vale «accesa», il valore di partenza dell owner');
  const giaNormale = testiUtenteWsl({ preferenze: { usaUtenteNormale: true }, wsl: { ...STATO_VERO.wsl, utentePredefinito: 'anna', predefinitoRoot: false, utenteNormale: 'anna', utenteUsato: 'anna', root: false } });
  assert.equal(giaNormale.nota, 'Vale per tutte le sessioni. In Ubuntu l’utente predefinito non è root: non cambia niente.');
  const misto = testiUtenteWsl({ wsl: { ...STATO_VERO.wsl, montaggi: [{ montaggio: '/mnt/c', metadata: false }, { montaggio: '/mnt/d', metadata: true }] } });
  assert.match(misto.dischi, /^\/mnt\/c, \/mnt\/d sono i dischi di Windows: nessun isolamento; su \/mnt\/c i permessi Linux non valgono\./);
  assert.equal(comandoPerCreareUtente('Debian'), 'wsl -d Debian -u root adduser <nome>');
});

test('WSL-T-04: l esito dice «come root» quando il kernel lo scrive, e legge ancora le etichette di prima', () => {
  const vera = "wsl2 (Linux in WSL come root; nessun isolamento: /mnt/c è il disco di Windows con i diritti dell'utente Windows di TALOS, e lì i permessi Linux non valgono)";
  assert.equal(dovEGirato(vera), 'in Linux (WSL) come root, non su Windows');
  assert.equal(dovEGirato("wsl2 (Linux in WSL come mario; nessun isolamento: i dischi di Windows sono in /mnt con i diritti dell'utente Windows di TALOS)"), 'in Linux (WSL) come mario, non su Windows');
  assert.equal(dovEGirato("wsl2 (Linux in WSL con un utente non verificato; nessun isolamento: i dischi di Windows sono in /mnt con i diritti dell'utente Windows di TALOS)"), 'in Linux (WSL), con un utente non verificato');
  assert.equal(dovEGirato("wsl2 (Linux in WSL; nessun isolamento: i dischi di Windows sono in /mnt con i diritti dell'utente Windows di TALOS)"), 'in Linux (WSL), non su Windows');
  assert.equal(dovEGirato('wsl2 (namespace Linux: filesystem e processi separati)'), 'in Linux (WSL), non su Windows', 'sessioni registrate prima del 01/10');
  const esito = leggiEsitoComando(`exit 1 [sandbox: ${vera}]\nERR\n`);
  assert.equal(rigaDiStatoComando(esito), 'Non riuscito · codice 1 · in Linux (WSL) come root, non su Windows');
});

test('WSL-T-05 (fase B): con la casa Linux pronta «Automatico» e «Linux» dicono che anche i file lavorano in Linux; senza, i testi di sempre', () => {
  const conCasa = { ...STATO_VERO, wsl: { ...STATO_VERO.wsl, casaLinux: { pronta: true } } };
  const t = testiDoveGiranoIComandi(conCasa);
  assert.equal(t.automatico.badge, 'Linux con WSL');
  assert.equal(t.automatico.sub, 'Una casa sola: con WSL comandi e attrezzi dei file lavorano in Linux, senza WSL su Windows.');
  assert.match(t.linux.sub, /^Sempre in Linux, comandi e attrezzi dei file con gli stessi percorsi\. Se WSL non c’è/);
  assert.equal(t.linux.badge, undefined, '«Consigliato» resta quello del template');
  assert.equal(testiDoveGiranoIComandi(STATO_VERO), null, 'binari della casa assenti: il comportamento è quello di prima, e i testi pure')
  assert.equal(testiDoveGiranoIComandi({ wsl: { ...STATO_VERO.wsl, casaLinux: { pronta: false, motivo: 'manca manifesto.json' } } }), null);
  assert.equal(testiDoveGiranoIComandi({ wsl: { disponibile: false, casaLinux: { pronta: true } } }), null, 'senza WSL la casa non c è');
  assert.equal(testiDoveGiranoIComandi(null), null);
});

/* 03/10/2026, seconda ondata della lingua (owner: l'inglese è la sorgente, l'italiano la traduzione): le stesse forme vere in
   inglese, frase intera per ogni caso — un disco, più dischi, alcuni senza permessi — e il segnaposto del comando. */
test('WSL-T-EN: in inglese le frasi sono intere e il plurale lo sceglie il numero dei dischi', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  impostaLingua('en');
  try {
    const t = testiUtenteWsl(STATO_VERO);
    assert.equal(t.chi, 'In Linux, commands run as root (Ubuntu)');
    assert.equal(t.dischi, '/mnt/c, /mnt/d are the Windows disks: no isolation, and Linux permissions do not apply there. If a command runs as root without your approval, TALOS asks you once per session.');
    assert.equal(t.nota, 'Applies to all sessions. Ubuntu does not have one. To create it, from a Windows terminal:');
    assert.equal(t.comando, 'wsl -d Ubuntu -u root adduser <name>');
    const uno = testiUtenteWsl({ ...STATO_VERO, wsl: { ...STATO_VERO.wsl, montaggi: [{ montaggio: '/mnt/c', metadata: true }] } });
    assert.match(uno.dischi, /^\/mnt\/c is the Windows disk: no isolation\./u);
    const alcuni = testiUtenteWsl({ ...STATO_VERO, wsl: { ...STATO_VERO.wsl, montaggi: [{ montaggio: '/mnt/c', metadata: true }, { montaggio: '/mnt/d', metadata: false }] } });
    assert.match(alcuni.dischi, /^\/mnt\/c, \/mnt\/d are the Windows disks: no isolation; on \/mnt\/d Linux permissions do not apply\./u);
  } finally { impostaLingua('it'); }
});
