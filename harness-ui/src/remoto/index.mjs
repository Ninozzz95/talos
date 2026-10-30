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

import { randomBytes } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { dirname, join } from 'node:path';
import { creaAccoppiamento } from './accoppiamento.mjs';
import { creaCartelleDeiDispositivi } from './cartelle-dispositivi.mjs';
import { creaElencoDispositivi, svegliaValida } from './dispositivi.mjs';
import { creaFileDeiDispositivi } from './file-dispositivi.mjs';
import { creaIdentitaRemoto } from './identita.mjs';
import { creaOperazioni } from './operazioni.mjs';
import { creaServizioRemoto } from './servizio.mjs';
import { analizzaIndirizzoRelay, avviaTrasportoIroh, relaySenzaGettone } from './trasporto-iroh.mjs';
import qrcode from 'qrcode-generator';
import webpush from 'web-push';
import { creaSveglia } from './sveglia.mjs';

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

/*
 * La matrice del QR la calcola il server, per la finestra e per la CLI allo stesso modo. `qrcode-generator` 2.0.4 (MIT, nessuna
 * dipendenza, 30 file: scelto per il peso dell'aggiornamento, owner 11/10) invece di `qrcode` (Happy `qrMatrix.ts`, t3code), che
 * porta con sé yargs e pngjs.
 * Correzione d'errore L (owner 26/10/2026 notte tarda, «Sì, rimpicciolisci»): il QR col relay di n0 non entrava in un terminale
 * 120×30. Come chi lo stampa nel terminale: Hermes `telegram_managed_bot.py:63-75` (ERROR_CORRECT_L) e Happy CLI `qrcode.ts:6-15`
 * (`qrcode-terminal`, L di serie); M è dell'app di Happy, che lo disegna in pixel. Codex non disegna QR (ricerca della CLI,
 * `RICERCA-T4-QR-ALTEZZA.md` §1-§2.2: la frase di prima, «M come Happy e Codex», era imprecisa). ⛔ Da provare col telefono vero
 * prima di pubblicare (Windows Terminal e conhost): condizione dell'owner.
 */
export function moduliDelQr(testo) {
  const q = qrcode(0, 'L');
  q.addData(testo);
  q.make();
  const lato = q.getModuleCount();
  const righe = [];
  for (let r = 0; r < lato; r += 1) { let riga = ''; for (let c = 0; c < lato; c += 1) riga += q.isDark(r, c) ? '1' : '0'; righe.push(riga); }
  return { lato, righe };
}

function relayValido(relay) {
  if (relay?.modo === 'n0') return { modo: 'n0' };
  if (relay?.modo === 'proprio' && typeof relay.url === 'string' && relay.url.trim()) {
    const url = relay.url.trim().slice(0, 500);
    /* D-C3 (revisione a blocco 3, 24/10/2026): la stessa regola dell'accensione, già qui — la rotta rifiuta e la carta resta aperta */
    let analizzato;
    try { analizzato = analizzaIndirizzoRelay(url); } catch { return null; }
    /*
     * Owner 26/10/2026 notte tarda (QR più piccolo; trovato dal Mobile con le prove di andata e ritorno): si salva e si mette nel QR la
     *   forma NORMALIZZATA dell'indirizzo (`URL.href`: spazi e caratteri non ASCII codificati). Il PC legge con l'URL del WHATWG, che
     *   accetta «con spazio+più»; il telefono con `java.net.URI` (`TalosRemotoCustodia.kt:95-107`), che lo rifiuta («Illegal character in
     *   query») e diceva «indirizzo del relay non utilizzabile». Il gettone letto dalle due forme è lo stesso (`searchParams.get`).
     * ⛔ La barra dopo il dominio NON si aggiunge se non c'era: `href` scrive «https://host/» per «https://host», e il telefono confronta
     *   i relay propri come testo (`ponteDi`) — un PC già accoppiato sembrerebbe un altro.
     * ⛔ Revisione blocco 7, C-R1: si toglie SOLO se dopo il dominio non c'è un percorso. Il WHATWG legge anche `https:host/talos`,
     *   `https:/host/talos` e `https:\\host\talos`: lì l'espressione sul testo dice «nessuna barra scritta», ma la barra di `href` è
     *   quella del PERCORSO, e toglierla incollava il percorso all'host («relay.casa.exampletalos»).
     */
    const conBarra = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*\//iu.test(url) || analizzato.pathname !== '/';
    const normale = conBarra ? analizzato.href : analizzato.href.replace(/^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)\//iu, '$1');
    return { modo: 'proprio', url: normale };
  }
  return null;
}

/**
 * `fileImpostazioni`, `fileTelefoni`: nella cartella dei dati. `chiama`: `creaChiamataInterna`. `caricaIroh`: async → il binding,
 * o null se su questa macchina non c'è (il remoto lo dice: «non disponibile»).
 */
/**
 * D-3 del Mobile (25/10/2026): la sveglia per un'offerta appena registrata — solo se è nuova (`inviato`) e c'è chi sveglia; anche
 * a un dispositivo collegato (B-2 sotto: la coda gli dà la grazia e la sua `device.seen` la toglie). Torna se ha messo in coda.
 */
export function svegliaPerOfferta(o, { svegliatore } = {}) {
  /* ⛔ Revisione a blocco 7 (B-2): anche a un dispositivo COLLEGATO. «Collegato» non vuol dire «dentro quella conversazione» (l'avviso
     `file.nuovo` va solo a chi è iscritto a quella sessione), né «visto» (un'app uccisa resta in linea ~30 s): la coda lo tratta come
     ogni novità — grazia da collegato, poi la sveglia, a meno della sua `device.seen` per quella sessione */
  if (o?.stato !== 'inviato' || !svegliatore || typeof o.dispositivoId !== 'string') return false;
  svegliatore.offerta(o.dispositivoId, o.sessionId);
  return true;
}

export function creaRemoto({
  keyring, fileImpostazioni, fileTelefoni, chiama, sessionRegistry, iscriviConRigiocata, caricaIroh, nomePc = null,
  effimero = false, // 24/10/2026: portachiavi di prova in memoria ⇒ identità che rinasce a ogni avvio (`servizio.mjs`, `pair.ok`)
  avviaTrasporto = avviaTrasportoIroh, fs = fsp, avvisa = () => {}, inviaWebPush = (i, c, o) => webpush.sendNotification(i, c, o),
  /* R5.12 (owner 23/10/2026 sera): le cartelle dei dispositivi col consenso del PC. Senza i due file (chi crea il remoto senza dati,
     le prove vecchie) resta l'elenco di prima, `/api/v1/projects`. */
  fileConsensi = null, fileSegretoCartelle = null, cartelleAmmesse = [], cartelleEscluse = [],
  cartellaChat = null, // Parte 4 (24/10/2026): la cartella di serie della Chat dei dispositivi, nei dati di TALOS
  chatImageStore = null, // D-5 (25/10/2026): l'archivio delle immagini della chat, lo stesso della finestra
  /* 26/10/2026 (CLI 0.6.15, T2): chi ospita il remoto dice il SUO nome al telefono («TALOS CLI»), e le capacità che dichiara
     (`servizio.mjs`). Di serie come prima: «TALOS desktop», nessuna capacità. */
  programma = 'TALOS desktop', capacita = [],
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
  const cartelle = fileConsensi && fileSegretoCartelle
    ? creaCartelleDeiDispositivi({ fileConsensi, fileSegreto: fileSegretoCartelle, sessionRegistry, cartelleAmmesse, cartelleEscluse, cartellaChat, fs })
    : null;
  /*
   * R5.13 (24/10/2026 notte, contratto Parte 2): lo scambio di file, accanto alle cartelle (senza consenso non c'è) e coi suoi dati
   *   accanto ai loro (`file-dispositivi/`: parziali, offerte, segreto degli id). Gli eventi di una sessione si leggono con la stessa
   *   rigiocata della rotta `/events` (`iscriviti` rigioca in modo sincrono; ci si disiscrive subito): nessun accesso nuovo al registro.
   */
  const file = cartelle && fileSegretoCartelle
    ? creaFileDeiDispositivi({
      cartella: join(dirname(fileSegretoCartelle), 'file-dispositivi'), sessionRegistry,
      // revisione blocco 11 (A-R2): le cartelle bloccate di quel dispositivo, dalla stessa fonte di `remote_phone_folders`
      bloccateDi: async (dispositivoId) => (await cartelle.consensiDi(dispositivoId)).filter((c) => c.bloccata).map((c) => c.percorso),
      salvaImmagine: chatImageStore ? (x) => chatImageStore.upload(x) : null,
      eventiDellaSessione: (sessionId) => {
        const eventi = [];
        const togli = sessionRegistry?.iscriviti?.(sessionId, (evento) => { eventi.push(evento); }, 0);
        try { togli?.(); } catch { /* niente */ }
        return eventi;
      },
    })
    : null;
  const operazioniBase = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle, file });
  /* D-3 del Mobile (25/10/2026, contratto Parte 2 «Revision 2»): un'offerta appena registrata sveglia il suo dispositivo (`f: 1`, poi
     il dispositivo chiede `file.offers`); collegato o no (B-2, revisione a blocco 7), finché non manda `device.seen` per quella sessione */
  file?.ascoltaOfferte((o) => { svegliaPerOfferta(o, { svegliatore }); });
  /*
   * R2.1 (24/10/2026, contratto Parte 1 «Revision 2»): a stream della finestra acceso il giro a tempo non c'è più, quindi i cambi che
   *   la finestra vedeva solo rileggendo lo stato — un dispositivo che entra o esce (il pallino «in linea»), un accoppiamento in attesa
   *   — si annunciano qui: `remote.changed {motivo}`, e la finestra rilegge `/api/v1/remote`. Solo il motivo: lo stato resta quello
   *   della lettura, con le sue regole (il gettone del relay mai alla finestra, ecc.).
   */
  const ascoltatoriStato = new Set();
  /* 26/10/2026 (contratto con la CLI, T5): anche una sveglia partita — la finestra rilegge `sveglie` e dice «avvisato il telefono» */
  const MOTIVI_DI_CAMBIO = new Set(['telefono-collegato', 'telefono-scollegato', 'accoppiamento-in-attesa', 'sveglia-inviata']);
  const avvisaEAnnuncia = (a) => {
    avvisa(a);
    if (!MOTIVI_DI_CAMBIO.has(a?.tipo)) return;
    /* B-R2 (CLI, 27/10): la sveglia mandata dice anche PER QUALE sessione, così chi mostra quella carta rilegge solo se lo riguarda */
    const evento = { type: 'remote.changed', motivo: a.tipo, ...(a.tipo === 'sveglia-inviata' && typeof a.sessione === 'string' ? { sessione: a.sessione } : {}) };
    for (const fn of [...ascoltatoriStato]) { try { fn(evento); } catch { /* un ascoltatore che cade non ferma il servizio */ } }
  };
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
        await cartelle?.dimentica(id); // R5.12: dimenticato, nessuna sua cartella resta consentita
        await file?.dimenticaDispositivo(id); // R5.13: i suoi trasferimenti a metà e le sue offerte se ne vanno con lui
        svegliatore?.dimentica(id); // T5 (26/10): le sue sveglie non si raccontano più
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
  /* ⛔ Revisione a blocco 5 (24/10/2026, REV5-COL-2, S3): due salvataggi nello stesso millisecondo (l'«accendi» del QR e lo «spegni»)
     avevano lo stesso nome temporaneo `<file>.<pid>.<Date.now()>.tmp`: il primo `rename` portava via il file dell'altro, lo «spegni»
     lanciava ENOENT PRIMA di `ferma()` e il trasporto restava vivo (misurato: giri 1, 2, 4, 6, 8 di 12 della sonda REV5-COL-1). Ora i
     salvataggi stanno in fila (una promessa sola, come `inFila` di `cartelle-dispositivi.mjs`) e ognuno scrive lo stato DI QUEL MOMENTO;
     il nome temporaneo ha 8 byte casuali, come Hermes (`apps/desktop/electron/desktop-boot-preference.ts:66`, `randomUUID()`). */
  let filaSalvataggi = Promise.resolve();
  const salvaImpostazioni = () => {
    const questo = filaSalvataggi.then(async () => {
      await fs.mkdir(dirname(fileImpostazioni), { recursive: true });
      const temporaneo = `${fileImpostazioni}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        await fs.writeFile(temporaneo, JSON.stringify(impostazioni, null, 1), { encoding: 'utf8', mode: 0o600 });
        await fs.rename(temporaneo, fileImpostazioni);
      } catch (e) { await fs.rm(temporaneo, { force: true }).catch(() => {}); throw e; }
    });
    filaSalvataggi = questo.catch(() => {});
    return questo;
  };

  /* ⛔ Revisione a blocco 4 (24/10/2026, REV4-C3b, S2): «spegni» mentre l'accensione era in corso azzerava `avvio`, ma l'avvio in volo
     finiva DOPO e si installava (`trasporto = t`): stato «spento» nella finestra, PC raggiungibile dai dispositivi accoppiati (misurato:
     acceso false, pcId 'pc-id', trasporti avviati 1, fermati 0). Ora ogni `ferma()` alza la generazione, e un avvio nato in una
     generazione vecchia chiude il suo trasporto invece di installarlo — come Hermes (`apps/desktop/electron/backend-connection-state.ts`:
     `invalidate()` fa `generation += 1`, e `attachProcess`/`assertCurrentAttempt` rifiutano un tentativo superato). */
  let generazione = 0;
  const SUPERATO = 'REMOTE_START_SUPERSEDED';
  const ferma = async () => {
    generazione += 1;
    const t = trasporto; trasporto = null; servizio = null; avvio = null;
    fermaSveglia?.(); fermaSveglia = null; svegliatore = null;
    if (t) await t.ferma();
  };
  const accendi = async () => {
    if (trasporto) return trasporto;
    if (avvio) return avvio;
    const mia = generazione;
    const superato = () => errore(SUPERATO, 'Remote control was turned off while it was starting.');
    const questo = (async () => {
      const iroh = await caricaIroh();
      if (mia !== generazione) throw superato();
      if (!iroh) throw errore('REMOTE_UNAVAILABLE', 'Remote control is not available on this computer.');
      /* Una connessione può arrivare appena l'endpoint è su, prima che il servizio esista: aspetta lui. */
      let risolviServizio;
      const pronto = new Promise((r) => { risolviServizio = r; });
      const t = await avviaTrasporto({
        iroh, chiaveSegreta: identita.chiaveEndpoint(), relay: impostazioni.relay,
        gestisci: (c) => pronto.then((s) => s.gestisci(c)), avvisa,
      });
      /* REV4-C3b: spento mentre partiva ⇒ il trasporto appena nato si chiude qui e non si installa */
      if (mia !== generazione) { await t.ferma().catch(() => {}); throw superato(); }
      servizio = creaServizioRemoto({ pcId: t.id, nomePc, programma, capacita, vapidPubblica: identita.vapid().publicKey, accoppiamento, dispositivi, operazioni, avvisa: avvisaEAnnuncia, effimero: effimero === true });
      risolviServizio(servizio);
      /* La sveglia dei telefoni non collegati (contratto §E, §10): parte e si ferma col trasporto. */
      svegliatore = creaSveglia({
        elenca: () => sessionRegistry?.elenca?.() ?? [], dispositivi, inLinea: () => servizio?.inLinea() ?? [],
        vapid: identita.vapid(), invia: inviaWebPush, avvisa: avvisaEAnnuncia,
      });
      fermaSveglia = svegliatore.avvia();
      trasporto = t;
      ultimoErrore = null;
      return t;
    })();
    avvio = questo;
    try { return await questo; } catch (e) {
      /* un avvio superato non tocca lo stato di chi l'ha superato (un `ferma()`, o un'accensione nuova già partita) */
      if (avvio === questo) avvio = null;
      if (e?.code !== SUPERATO) ultimoErrore = e.code ?? 'REMOTE_START_FAILED';
      throw e;
    }
  };

  return {
    /** All'avvio del server: riaccende il remoto se era acceso (senza bloccare il server se non riesce). */
    async riprendi() {
      const i = await leggiImpostazioni();
      if (i.acceso && i.relay) await accendi().catch(() => {});
    },

    async stato() {
      const i = await leggiImpostazioni();
      const elenco = await dispositivi.elenca();
      const disponibile = Boolean(await caricaIroh().catch(() => null));
      return {
        disponibile, acceso: i.acceso, sceltaFatta: Boolean(i.relay),
        /* R5.9: il gettone di talos-relay resta nelle impostazioni e nel QR, mai nella finestra */
        relay: i.relay?.modo === 'proprio' ? { ...i.relay, url: relaySenzaGettone(i.relay.url) } : i.relay,
        pcId: trasporto?.id ?? null, inLinea: servizio?.inLinea() ?? [], ultimoErrore,
        /* 24/10/2026 (contratto col Mobile, tavola 1 del bozzetto remoto): il nome del PC, accanto al suo codice breve nella finestra */
        nomePc: typeof nomePc === 'string' && nomePc ? nomePc : null,
        telefoni: elenco.map((v) => ({ ...v, inLinea: (servizio?.inLinea() ?? []).includes(v.id), percorso: servizio?.percorsi()[v.id] ?? null })),
        /* «Telefono avvisato» (contratto con la CLI, 26/10/2026, T5): l'ultima sveglia accettata per ogni telefono non revocato, in memoria */
        sveglie: (svegliatore?.ultimeSveglie() ?? []).flatMap((s) => {
          const v = elenco.find((x) => x.id === s.telefono && !x.revocatoAlle);
          return v ? [{ ...s, nome: v.nome ?? null }] : [];
        }),
        attese: accoppiamento.inAttesa(), accoppiamento: accoppiamento.stato(),
        /* R5.12: le domande «Consenti a … di lavorare in …?» aperte, per la carta della finestra (il percorso intero solo qui) */
        consensi: cartelle?.inAttesa() ?? [],
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
      if (i.acceso && !i.relay) throw errore('REMOTE_RELAY_NOT_CHOSEN', 'Choose how the device reaches this computer away from home first.');
      /* ⛔ D-C3 (revisione a blocco 3, 24/10/2026): «acceso» si salva solo se l'accensione RIESCE. Prima si salvava prima di provarci,
         e un'accensione fallita lasciava lo stato (e l'icona dell'intestazione) a «acceso» con un errore accanto. */
      if (i.acceso) {
        try { await accendi(); }
        catch (e) {
          /* REV4-C3b: superata da uno «spegni» (o da un'accensione più nuova), lo stato è già di chi l'ha superata: non si riscrive, e
             questa richiesta risponde con lo stato vero invece di un errore che la finestra non conosce */
          if (e?.code === SUPERATO) return this.stato();
          i.acceso = false; await salvaImpostazioni();
          throw e;
        }
        await salvaImpostazioni();
      } else {
        await salvaImpostazioni();
        await ferma();
      }
      return this.stato();
    },

    /**
     * Il QR: accende il remoto se serve (la persona ha appena scelto di collegare un telefono). R5.12: `soloSeAcceso` (il QR chiesto
     * dalla chat, owner 18/10/2026) NON lo accende — accendere resta della schermata.
     */
    async apriAccoppiamento({ soloSeAcceso = false } = {}) {
      const i = await leggiImpostazioni();
      if (!i.relay) throw errore('REMOTE_RELAY_NOT_CHOSEN', 'Choose how the device reaches this computer away from home first.');
      if (!i.acceso && soloSeAcceso) throw errore('REMOTE_OFF', 'Remote control is off: turn it on from the Connected devices screen.');
      /* ⛔ Revisione a blocco 4 (24/10/2026, REV4-C3a, S3): la stessa regola di D-C3 in `imposta` — «acceso» si salva solo DOPO
         un'accensione riuscita. Prima si salvava e poi si accendeva: un'accensione fallita lasciava «acceso» con REMOTE_START_FAILED
         accanto (e il server, al riavvio, ci riprovava da solo con `riprendi`). */
      /* ⛔ Revisione a blocco 5 (24/10/2026, REV5-COL-1, S2): qui c'erano DUE `accendi()` — la prima, poi il salvataggio, poi la seconda
         per il QR. Uno «spegni» arrivato fra le due chiudeva il primo trasporto, e la seconda ne avviava uno NUOVO: stato «spento»,
         PC raggiungibile, QR mostrato (misurato: giro 7 di 12, avviati 2, fermati 1, pcId 'pc-2'). Ora un'accensione sola, riusata per
         il QR; e prima del QR si ricontrollano la generazione presa all'inizio e «acceso»: se uno «spegni» è passato, REMOTE_OFF. */
      const mia = generazione;
      const spento = () => errore('REMOTE_OFF', 'Remote control was turned off while it was starting.');
      let t;
      if (!i.acceso) {
        i.acceso = true;
        try { t = await accendi(); }
        catch (e) {
          /* REV4-C3b: spento mentre partiva ⇒ niente QR, e lo si dice col codice che la finestra conosce già */
          if (e?.code === SUPERATO) throw spento();
          i.acceso = false;
          throw e;
        }
        await salvaImpostazioni();
      } else {
        try { t = await accendi(); }
        catch (e) { if (e?.code === SUPERATO) throw spento(); throw e; }
      }
      if (mia !== generazione || !i.acceso) throw spento();
      /* Owner 26/10/2026 notte tarda: con i server di n0 il QR non porta il relay — il telefono trova il PC dal suo id (scoperta n0,
         `presetN0` in `trasporto-iroh.mjs`; docs.iroh.computer «Another endpoint needs only the Endpoint ID to connect»; il telefono
         lo accetta da 0.1.44, `relayDalQr(null)`). Il relay proprio resta: porta il gettone e un indirizzo che n0 non dà. */
      const relay = i.relay.modo === 'proprio' ? i.relay.url : null;
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
    async revoca(id) {
      const esito = servizio ? await servizio.revoca(id, 'pc') : await dispositivi.revoca(id, 'pc');
      await cartelle?.dimentica(id); // R5.12
      svegliatore?.dimentica(id); // T5 (26/10): le sue sveglie non si raccontano più
      await file?.dimenticaDispositivo(id); // R5.13
      return esito;
    },
    /** R5.12: le cartelle dei dispositivi (null se questo server non le ha) — per le rotte della finestra e il cancello delle rotte */
    cartelle,
    /** R5.13: lo scambio di file (null senza le cartelle) — `registraOfferta`, `offerte`, `ascoltaOfferte` per l'attrezzo e la carta (corsa 2) */
    file,
    /** R2.1: ascolta i `remote.changed` (vedi `avvisaEAnnuncia`); torna la funzione che smette. Per lo stream della finestra. */
    ascoltaStato(fn) {
      if (typeof fn !== 'function') return () => {};
      ascoltatoriStato.add(fn);
      return () => { ascoltatoriStato.delete(fn); };
    },
    ferma,
  };
}
