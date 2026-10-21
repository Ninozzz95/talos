/*
 * Controllo remoto — il COORDINATORE del lato PC: tiene insieme identità, elenco dei telefoni, accoppiamento, servizio, operazioni
 * e trasporto, e dà all'interfaccia del desktop (rotte locali `/api/v1/remote…`) le poche cose che il mockup v5 chiede:
 *   · «Solo la prima volta»: come arriva il telefono al PC fuori casa — i server gratuiti di n0, o il proprio `talos-relay`
 *     (owner 17/10, contratto §19.2). Finché non si sceglie, il remoto resta spento e nessun endpoint si apre.
 *   · il QR con la sua scadenza, la conferma col codice di 6 cifre («Collega» / «Annulla»);
 *   · «Telefoni collegati»: chi c'è, chi è in linea, rinomina, revoca (anche «revocato dal telefono»).
 * Spento, non apre niente verso la rete: il trasporto parte solo con `acceso: true` e un relay scelto.
 *
 * Le impostazioni stanno in un file della cartella dei dati (non sono segreti); le chiavi nel portachiavi (`identita.mjs`).
 */

import { promises as fsp } from 'node:fs';
import { dirname } from 'node:path';
import { creaAccoppiamento } from './accoppiamento.mjs';
import { creaElencoDispositivi, svegliaValida } from './dispositivi.mjs';
import { creaIdentitaRemoto } from './identita.mjs';
import { creaOperazioni } from './operazioni.mjs';
import { creaServizioRemoto } from './servizio.mjs';
import { avviaTrasportoIroh, relaySenzaGettone } from './trasporto-iroh.mjs';
import qrcode from 'qrcode-generator';
import webpush from 'web-push';
import { creaSveglia } from './sveglia.mjs';

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

/*
 * La matrice del QR la calcola il server, per la finestra e per la CLI allo stesso modo. `qrcode-generator` 2.0.4 (MIT, nessuna
 * dipendenza, 30 file: scelto per il peso dell'aggiornamento, owner 11/10) invece di `qrcode` (Happy `qrMatrix.ts`, t3code), che
 * porta con sé yargs e pngjs. Correzione d'errore M, come i QR di accoppiamento di Happy e Codex.
 */
export function moduliDelQr(testo) {
  const q = qrcode(0, 'M');
  q.addData(testo);
  q.make();
  const lato = q.getModuleCount();
  const righe = [];
  for (let r = 0; r < lato; r += 1) { let riga = ''; for (let c = 0; c < lato; c += 1) riga += q.isDark(r, c) ? '1' : '0'; righe.push(riga); }
  return { lato, righe };
}

function relayValido(relay) {
  if (relay?.modo === 'n0') return { modo: 'n0' };
  if (relay?.modo === 'proprio' && typeof relay.url === 'string' && relay.url.trim()) return { modo: 'proprio', url: relay.url.trim().slice(0, 500) };
  return null;
}

/**
 * `fileImpostazioni`, `fileTelefoni`: nella cartella dei dati. `chiama`: `creaChiamataInterna`. `caricaIroh`: async → il binding,
 * o null se su questa macchina non c'è (il remoto lo dice: «non disponibile»).
 */
export function creaRemoto({
  keyring, fileImpostazioni, fileTelefoni, chiama, sessionRegistry, iscriviConRigiocata, caricaIroh, nomePc = null,
  avviaTrasporto = avviaTrasportoIroh, fs = fsp, avvisa = () => {}, inviaWebPush = (i, c, o) => webpush.sendNotification(i, c, o),
} = {}) {
  const identita = creaIdentitaRemoto({ keyring });
  const dispositivi = creaElencoDispositivi({ file: fileTelefoni, fs });
  const accoppiamento = creaAccoppiamento();
  let servizio = null;
  let trasporto = null;
  let fermaSveglia = null;
  let svegliatore = null;
  let impostazioni = null;
  let avvio = null;
  let ultimoErrore = null;
  const operazioniBase = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata });
  /* «Dimentica questo computer» dal telefono (contratto §12): l'unica operazione che tocca il servizio stesso. */
  const operazioni = {
    elenco: () => [...operazioniBase.elenco(), 'pc.forget', 'device.wake', 'device.wake.test', 'device.seen'],
    async esegui(op, args, contesto) {
      /*
       * R-M5 (Mobile, 21/10/2026): l'iscrizione Web Push arriva DOPO l'accoppiamento (il distributore vuole la VAPID del PC, che il
       * telefono riceve in `pair.ok`) e cambia quando il distributore ne dà una nuova. ⛔ Il telefono aggiorna SOLO la sua: l'id viene
       * dal canale (`contesto.dispositivo`), mai dagli argomenti. `null` = non svegliarmi più. Un'iscrizione che non vale (non https,
       * chiavi della lunghezza sbagliata) si rifiuta invece di salvarla muta.
       */
      if (op === 'device.wake') {
        const richiesta = args?.sveglia ?? null;
        const sveglia = richiesta === null ? null : svegliaValida(richiesta);
        if (richiesta !== null && !sveglia) throw Object.assign(errore('BAD_MESSAGE', 'The push subscription is not valid (https endpoint, p256dh of 65 bytes, auth of 16 bytes).'), { stato: 400 });
        const voce = await dispositivi.aggiornaSveglia(contesto.dispositivo.id, sveglia);
        return { sveglia: Boolean(voce?.sveglia) };
      }
      if (op === 'device.wake.test') {
        if (!svegliatore) throw errore('REMOTE_UNAVAILABLE', 'Remote control is not running on this computer.');
        return svegliatore.svegliaOra(contesto.dispositivo.id);
      }
      /* `device.seen` (Mobile, 21/10/2026): la carta di quella sessione è sullo schermo del telefono, app in primo piano ⇒ niente
         sveglia per lei. L'id del telefono viene dal canale, mai dagli argomenti. */
      if (op === 'device.seen') {
        const sessionId = args?.sessionId;
        if (typeof sessionId !== 'string' || !/^(?!\.+$)[A-Za-z0-9._:-]{1,200}$/u.test(sessionId)) throw Object.assign(errore('BAD_MESSAGE', 'A valid session id is needed.'), { stato: 400 });
        if (!sessionRegistry?.esiste?.(sessionId)) throw Object.assign(errore('NOT_FOUND', 'Session not found.'), { stato: 404 });
        svegliatore?.visto(contesto.dispositivo.id, sessionId);
        return { seen: true };
      }
      if (op === 'pc.forget') {
        /* Prima l'elenco (nessuna richiesta dopo questa passa), poi la risposta, POI la chiusura: chiudere prima perderebbe la
           risposta e il telefono non saprebbe se il PC l'ha dimenticato. */
        const id = contesto.dispositivo.id;
        await dispositivi.revoca(id, 'telefono');
        contesto.dopoLaRisposta(() => servizio?.revoca(id, 'telefono'));
        return { dimenticato: true };
      }
      return operazioniBase.esegui(op, args, contesto);
    },
  };

  const leggiImpostazioni = async () => {
    if (impostazioni) return impostazioni;
    let dati = null;
    try { dati = JSON.parse(await fs.readFile(fileImpostazioni, 'utf8')); } catch (e) { if (e?.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
    impostazioni = { acceso: dati?.acceso === true, relay: relayValido(dati?.relay) };
    return impostazioni;
  };
  const salvaImpostazioni = async () => {
    await fs.mkdir(dirname(fileImpostazioni), { recursive: true });
    const temporaneo = `${fileImpostazioni}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaneo, JSON.stringify(impostazioni, null, 1), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaneo, fileImpostazioni);
  };

  const ferma = async () => {
    const t = trasporto; trasporto = null; servizio = null; avvio = null;
    fermaSveglia?.(); fermaSveglia = null; svegliatore = null;
    if (t) await t.ferma();
  };
  const accendi = async () => {
    if (trasporto) return trasporto;
    if (avvio) return avvio;
    avvio = (async () => {
      const iroh = await caricaIroh();
      if (!iroh) throw errore('REMOTE_UNAVAILABLE', 'Remote control is not available on this computer.');
      /* Una connessione può arrivare appena l'endpoint è su, prima che il servizio esista: aspetta lui. */
      let risolviServizio;
      const pronto = new Promise((r) => { risolviServizio = r; });
      const t = await avviaTrasporto({
        iroh, chiaveSegreta: identita.chiaveEndpoint(), relay: impostazioni.relay,
        gestisci: (c) => pronto.then((s) => s.gestisci(c)), avvisa,
      });
      servizio = creaServizioRemoto({ pcId: t.id, nomePc, vapidPubblica: identita.vapid().publicKey, accoppiamento, dispositivi, operazioni, avvisa });
      risolviServizio(servizio);
      /* La sveglia dei telefoni non collegati (contratto §E, §10): parte e si ferma col trasporto. */
      svegliatore = creaSveglia({
        elenca: () => sessionRegistry?.elenca?.() ?? [], dispositivi, inLinea: () => servizio?.inLinea() ?? [],
        vapid: identita.vapid(), invia: inviaWebPush, avvisa,
      });
      fermaSveglia = svegliatore.avvia();
      trasporto = t;
      ultimoErrore = null;
      return t;
    })();
    try { return await avvio; } catch (e) { avvio = null; ultimoErrore = e.code ?? 'REMOTE_START_FAILED'; throw e; }
  };

  return {
    /** All'avvio del server: riaccende il remoto se era acceso (senza bloccare il server se non riesce). */
    async riprendi() {
      const i = await leggiImpostazioni();
      if (i.acceso && i.relay) await accendi().catch(() => {});
    },

    async stato() {
      const i = await leggiImpostazioni();
      const disponibile = Boolean(await caricaIroh().catch(() => null));
      return {
        disponibile, acceso: i.acceso, sceltaFatta: Boolean(i.relay),
        /* R5.9: il gettone di talos-relay resta nelle impostazioni e nel QR, mai nella finestra */
        relay: i.relay?.modo === 'proprio' ? { ...i.relay, url: relaySenzaGettone(i.relay.url) } : i.relay,
        pcId: trasporto?.id ?? null, inLinea: servizio?.inLinea() ?? [], ultimoErrore,
        telefoni: (await dispositivi.elenca()).map((v) => ({ ...v, inLinea: (servizio?.inLinea() ?? []).includes(v.id), percorso: servizio?.percorsi()[v.id] ?? null })),
        attese: accoppiamento.inAttesa(), accoppiamento: accoppiamento.stato(),
      };
    },

    /** «Solo la prima volta» e l'interruttore. Cambiare relay a remoto acceso lo riavvia. */
    async imposta({ acceso, relay } = {}) {
      const i = await leggiImpostazioni();
      if (relay !== undefined) {
        const nuovo = relayValido(relay);
        if (!nuovo) throw errore('REMOTE_RELAY_INVALID', 'Choose the free servers or enter the address of your own server.');
        const cambiato = JSON.stringify(nuovo) !== JSON.stringify(i.relay);
        i.relay = nuovo;
        if (cambiato && trasporto) await ferma();
      }
      if (acceso !== undefined) i.acceso = acceso === true;
      if (i.acceso && !i.relay) throw errore('REMOTE_RELAY_NOT_CHOSEN', 'Choose how the phone reaches this computer away from home first.');
      await salvaImpostazioni();
      if (i.acceso) await accendi(); else await ferma();
      return this.stato();
    },

    /**
     * Il QR: accende il remoto se serve (la persona ha appena scelto di collegare un telefono). R5.12: `soloSeAcceso` (il QR chiesto
     * dalla chat, owner 18/10/2026) NON lo accende — accendere resta della schermata.
     */
    async apriAccoppiamento({ soloSeAcceso = false } = {}) {
      const i = await leggiImpostazioni();
      if (!i.relay) throw errore('REMOTE_RELAY_NOT_CHOSEN', 'Choose how the phone reaches this computer away from home first.');
      if (!i.acceso && soloSeAcceso) throw errore('REMOTE_OFF', 'Remote control is off: turn it on from the Phones screen.');
      if (!i.acceso) { i.acceso = true; await salvaImpostazioni(); }
      const t = await accendi();
      const relay = i.relay.modo === 'proprio' ? i.relay.url : t.relayDiCasa();
      const offerta = accoppiamento.apri({ pcId: t.id, relay });
      return { gettone: offerta.gettone, qr: offerta.qr, scadeAlle: offerta.scadeAlle, moduli: moduliDelQr(offerta.qr) };
    },
    chiudiAccoppiamento(gettone) { accoppiamento.chiudi(gettone); },

    async conferma(id) {
      if (!servizio) throw errore('PAIR_NOT_PENDING', 'This pairing request is no longer waiting.');
      return servizio.conferma(id);
    },
    rifiuta(id) { return servizio ? servizio.rifiuta(id) : false; },
    rinomina: (id, nome) => dispositivi.rinomina(id, nome),
    async revoca(id) { return servizio ? servizio.revoca(id, 'pc') : dispositivi.revoca(id, 'pc'); },
    ferma,
  };
}
