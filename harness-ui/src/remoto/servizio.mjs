/*
 * Controllo remoto — il SERVIZIO del PC: che cosa succede su ogni connessione che arriva (contratto v0.3 §B, §D, §11-12).
 *
 * Non sa niente di iroh: riceve dal trasporto (`trasporto-iroh.mjs`, o un finto nelle prove) una connessione già fatta, con
 * `remoteId` = la chiave pubblica di chi chiama, verificata dall'handshake TLS a chiavi nude (RFC 7250). Mai un id preso da un
 * messaggio.
 *
 * Due ALPN (condizione B.1 di Nino1):
 *   · `talos-remote-pair/1` — ammette uno sconosciuto SOLO col gettone valido; scambio:
 *       telefono → { t:'pair.hello', gettone, nome?, sveglia? }        (sveglia = iscrizione Web Push: endpoint + keys)
 *       PC       → { t:'pair.code', codice }                           (lo stesso codice è sul PC: la persona li confronta)
 *       telefono → { t:'pair.cancel' }                                  (facoltativo: il telefono può solo annullare, mockup §19)
 *       PC       → { t:'pair.ok', dispositivo, pc:{ nome, vapid } } | { t:'error', code:'PAIR_REJECTED'|'PAIR_EXPIRED'|… }
 *   · `talos-remote/1` — l'elenco si controlla PRIMA di leggere un byte: uno sconosciuto o un revocato riceve `NOT_PAIRED` e la
 *     chiusura. Poi richieste e risposte:
 *       telefono → { t:'req', n, op, args }      PC → { t:'res', n, ok:true, data } | { t:'res', n, ok:false, code, message }
 *       telefono → { t:'ping', s }               PC → { t:'pong', s }
 *       PC       → { t:'evt', sub, data }        (gli eventi di un'iscrizione; il «dal numero N» è il cursore della sessione)
 *
 * Idempotenza (§11): ogni richiesta porta `n`; il PC ricorda le risposte degli ultimi 10 minuti per quel telefono e, se `n` torna,
 * rimanda la stessa risposta senza rifare l'azione. Revoca (§12): chiude SUBITO le connessioni vive di quel telefono.
 */

import { ALPN_ACCOPPIAMENTO, ALPN_LAVORO } from './accoppiamento.mjs';
import { BYTE_MASSIMI, codifica, creaLettore, messaggioDiErrore } from './filo.mjs';
import { LETTURE_DEL_CONTRATTO, senzaPercorsiAssoluti } from './operazioni.mjs';

/*
 * D-RM4-5 (Mobile, 20/10/2026): il MOTIVO di un rifiuto, per il telefono. Solo un identificatore corto (`provider-key-missing-named`)
 *   e parametri semplici (stringhe, numeri, sì/no; dieci al più, ognuno al più 200 caratteri) coi percorsi oscurati come nel doctor:
 *   un errore interno con un percorso o un valore strano non passa. Senza un motivo valido, la risposta resta quella di prima.
 */
const MOTIVO_VALIDO = /^[A-Za-z0-9_.:-]{1,80}$/u;
const CHIAVE_VALIDA = /^[A-Za-z0-9_]{1,40}$/u;
/* Mobile 27/10/2026: la frase precisa del rifiuto (`explanation`), ripulita come i parametri: niente percorsi assoluti, 240 caratteri al più. */
export function spiegazionePerIlTelefono(e) {
  if (typeof e?.explanation !== 'string' || e.explanation.trim() === '') return {};
  return { explanation: senzaPercorsiAssoluti(e.explanation).slice(0, 240) };
}
export function motivoPerIlTelefono(e) {
  if (typeof e?.reason !== 'string' || !MOTIVO_VALIDO.test(e.reason)) return {};
  if (e.paramsControllati === true) return { reason: e.reason, params: e.params };
  const params = {};
  if (e.params && typeof e.params === 'object' && !Array.isArray(e.params)) {
    for (const [k, v] of Object.entries(e.params).slice(0, 10)) {
      if (!CHIAVE_VALIDA.test(k)) continue;
      if (typeof v === 'string') params[k] = senzaPercorsiAssoluti(v).slice(0, 200);
      else if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') params[k] = v;
    }
  }
  return { reason: e.reason, ...(Object.keys(params).length ? { params } : {}) };
}

export const MEMORIA_IDEMPOTENZA_MS = 10 * 60_000;
/*
 * R5.13 (24/10/2026 notte): le risposte che NON si ricordano. Una risposta di `file.read` porta fino a 512 KiB grezzi (~683 KiB in
 *   base64url): ricordandole, uno scarico da 25 MiB terrebbe ~34 MiB per 10 minuti e il tetto di 512 risposte arriverebbe a ~350 MiB
 *   per dispositivo. E non serve: rileggere lo stesso intervallo è già idempotente, e se il file è cambiato nel frattempo la risposta
 *   giusta è `FILE_GONE`, non i byte di prima.
 * D-29 (revisione del blocco 14): lo stesso vale per un diff, fino a 512 KB a risposta. Ridarne uno vecchio sarebbe anche sbagliato: il file può essere cambiato.
 */
export const RISPOSTE_NON_RICORDATE = Object.freeze(new Set(['file.read', ...LETTURE_DEL_CONTRATTO]));
export const RISPOSTE_RICORDATE_MASSIME = 512;
/*
 * Punto 14 del Mobile: le richieste di una connessione vanno in fila, e `session.git.fetch-stop` restava dietro il `fetch` che doveva fermare (nemmeno il ping passava). Le voci che
 *   aspettano la rete o un modello girano accanto alla fila, al più `VOCI_LUNGHE_INSIEME` per connessione: oltre, la fila aspetta che una finisca. Le risposte si abbinano con `n`.
 */
export const VOCI_LUNGHE = Object.freeze(new Set(['session.git.fetch', 'session.git.pull', 'session.git.push', 'session.git.commit-message', 'session.research.recheck']));
const VOCI_LUNGHE_INSIEME = 4;
/*
 * B3 (revisione 3 del Mobile): chi legge i messaggi non aspetta più chi li esegue. Il ping e `.fetch-stop` passano anche con le voci lunghe al tetto o una voce normale appesa, e il
 *   resto va in fila, nell'ordine in cui è arrivato. La fila ha un tetto: una richiesta pesa fino a 1 MiB, e oltre si smette di leggere, come prima. `.fetch-stop` sta fuori perché ferma una
 *   voce che gira accanto alla fila: non ha un ordine da rispettare. Le altre voci che fermano restano in fila: `session.stop` deve arrivare dopo il messaggio che lo precede.
 * ⛔ N7, limite dichiarato: con 64 voci in fila il ping e `.fetch-stop` aspettano anche loro. Per farli passare si dovrebbe continuare a leggere, quindi tenere senza tetto richieste da 1 MiB, o
 *   rifiutarle con una risposta che il contratto non ha.
 * N5: `.fetch-stop` ferma anche il `.fetch` che non è ancora partito, su ogni connessione del dispositivo. Quel `.fetch` resta al suo posto e al suo turno risponde `GIT_ABORTED`, senza partire.
 */
const FILA_MASSIMA = 64;
const VOCE_FUORI_FILA = 'session.git.fetch-stop';
const VOCE_CHE_SI_FERMA = 'session.git.fetch';
/*
 * Sospetto del Mobile: con più voci insieme e gli eventi non attesi, due scritture potevano sovrapporsi, e `writeAll` di iroh non dichiara che cosa succede. Una alla volta, nell'ordine in cui
 *   sono state chieste. `scrivi` resta sincrona per chi la chiama: `codifica` lancia prima di arrivare qui, ed è quel lancio che D-44 raccoglie.
 */
function scrittureInOrdine(stream) {
  let ultima = Promise.resolve();
  return { ...stream, scrivi(byte) { const questa = ultima.then(() => stream.scrivi(byte)); ultima = questa.catch(() => {}); return questa; } };
}
const N_VALIDO = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * `stream`: { leggi(): Promise<Uint8Array|null>, scrivi(bytes): Promise<void>, finisci(): Promise<void> }
 * `connessione`: { remoteId: string, alpn: string, stream, chiudi(codice: string): void }
 * `operazioni`: { esegui(op, args, contesto) → Promise<data> } — l'elenco CHIUSO (`operazioni.mjs`); lancia `UNKNOWN_OPERATION`.
 */
export function creaServizioRemoto({
  pcId, nomePc = null, programma: programmaChiesto = 'TALOS desktop', vapidPubblica = null, accoppiamento, dispositivi, operazioni, clock = () => Date.now(), avvisa = () => {},
  /* 24/10/2026 (fetta C del Mobile, PC doppi; contratto v0.3 §B, campo aggiuntivo): `true` quando il PC gira col portachiavi di
     PROVA in memoria — la sua identità rinasce a ogni avvio, quindi sul dispositivo diventa una voce nuova ogni volta. Il dispositivo
     la segna «di prova» e la propone per prima da dimenticare. Assente (mai `false`) negli altri casi: le versioni vecchie non cambiano. */
  effimero = false,
  /* Trovato dal Mobile (19/10): dopo `pair.ok` il PC chiudeva SUBITO la connessione, e una chiusura di QUIC può buttare i byte non
     ancora letti — il telefono restava senza `pair.ok` pur essendo accoppiato. Ora il PC chiude la sua scrittura (half-close) e
     aspetta che il telefono chiuda la sua, o cada, al più questo tempo. Il telefono dà 60 s di grazia dal suo lato. */
  attesaDopoPairOkMs = 15_000,
  /* 26/10/2026 (CLI 0.6.15, contratto `spazio` concordato con CLI e Mobile): le capacità che QUESTO programma dichiara al telefono
     (per esempio 'spazio-worktree'). Il telefono mostra una scelta solo a un PC che la dichiara. Vuoto (di serie) ⇒ il campo non c'è,
     né in `pair.code`/`pair.ok` né in `pc.info`: i PC di oggi non cambiano. */
  capacita = [],
} = {}) {
  /* Revisione blocco 2 (N4): un `programma` vuoto o non stringa (anche `null`, che il valore di serie non copre) arrivava così al
     telefono. Si dice sempre un nome. */
  const programma = typeof programmaChiesto === 'string' && programmaChiesto.trim() !== '' ? programmaChiesto.trim().slice(0, 60) : 'TALOS desktop';
  const capacitaDichiarate = Object.freeze([...new Set((Array.isArray(capacita) ? capacita : []).filter((c) => typeof c === 'string' && /^[a-z0-9-]{1,40}$/u.test(c)))]);
  const conCapacita = capacitaDichiarate.length ? { capacita: capacitaDichiarate } : {};
  /** id del dispositivo → Set di connessioni vive */
  const vive = new Map();
  /** id del dispositivo → Map n → { quando, risposta } */
  const ricordate = new Map();
  /* B9: id del dispositivo → Map n → promessa della risposta, per le voci che si ricordano. La memoria qui sopra vale dalla fine della voce: mentre gira, lo stesso `n` su una connessione
     nuova la rifaceva, e un invio partiva due volte. Si aspetta la prima, come `lunghe` fa sulla stessa connessione, invece di un rifiuto: il telefono ha già la risposta che gli serve. */
  const inVolo = new Map();
  /* N5: id del dispositivo → Set delle funzioni che fermano i `.fetch` non ancora partiti, una per connessione */
  const fileVive = new Map();

  const scrivi = (stream, m) => stream.scrivi(codifica(m));
  const ricorda = (dispositivoId, n, risposta) => {
    let m = ricordate.get(dispositivoId);
    if (!m) { m = new Map(); ricordate.set(dispositivoId, m); }
    const ora = clock();
    for (const [k, v] of m) if (ora - v.quando >= MEMORIA_IDEMPOTENZA_MS) m.delete(k);
    while (m.size >= RISPOSTE_RICORDATE_MASSIME) m.delete(m.keys().next().value);
    m.set(n, { quando: ora, risposta });
  };
  const giaRisposta = (dispositivoId, n) => {
    const v = ricordate.get(dispositivoId)?.get(n);
    return v && clock() - v.quando < MEMORIA_IDEMPOTENZA_MS ? v.risposta : null;
  };

  /* Legge i messaggi uno alla volta finché lo stream non finisce o il chiamante dice basta. */
  async function* messaggi(stream) {
    const lettore = creaLettore();
    for (;;) {
      const pezzo = await stream.leggi();
      if (pezzo == null) return;
      for (const m of lettore.aggiungi(pezzo)) yield m;
    }
  }

  async function accoppia(connessione) {
    const { stream, remoteId } = connessione;
    let attesa = null;
    try {
      const giro = messaggi(stream);
      const primo = (await giro.next()).value;
      if (!primo || primo.t !== 'pair.hello') { await scrivi(stream, messaggioDiErrore('BAD_MESSAGE')); return connessione.chiudi('BAD_MESSAGE'); }
      try {
        attesa = accoppiamento.presenta({ gettone: primo.gettone, pcId, telefonoId: remoteId, nome: primo.nome, piattaforma: primo.piattaforma, sveglia: primo.sveglia ?? null });
      } catch (e) {
        /* Revisione blocco 9 (B-R1): anche PAIR_EXPIRED arriva al telefono com'è («QR scaduto, chiedine uno nuovo»); prima ogni altro errore
           diventava PAIR_TOKEN_INVALID («codice sconosciuto») e solo il motivo di chiusura diceva la verità. */
        await scrivi(stream, messaggioDiErrore(['PAIR_LOCKED', 'PAIR_EXPIRED'].includes(e.code) ? e.code : 'PAIR_TOKEN_INVALID', { retryAfterMs: e.retryAfterMs }));
        return connessione.chiudi(e.code ?? 'PAIR_TOKEN_INVALID');
      }
      avvisa({ tipo: 'accoppiamento-in-attesa', id: attesa.id, nome: primo.nome ?? null, codice: attesa.codice });
      await scrivi(stream, { t: 'pair.code', codice: attesa.codice, pc: { id: pcId, nome: nomePc, programma, ...(effimero === true ? { effimero: true } : {}), ...conCapacita } });
      /* Il telefono può solo annullare (o cadere): lo si ascolta mentre la persona decide sul PC. Una fine NORMALE del suo lato
         (scrive il saluto e chiude la scrittura, come fanno le sonde iroh) non è un annullamento: si aspetta la connessione. */
      let segnaFineLettura;
      const fineLettura = new Promise((r) => { segnaFineLettura = r; });
      const annullato = (async () => {
        try { for await (const m of giro) if (m.t === 'pair.cancel') { segnaFineLettura(); return true; } } catch { segnaFineLettura(); return true; }
        segnaFineLettura();
        return connessione.chiusa ? connessione.chiusa.then(() => true) : new Promise(() => {});
      })();
      const esito = await Promise.race([attesa.attendi(), annullato.then(() => ({ esito: 'annullato-dal-telefono' }))]);
      if (esito.esito === 'annullato-dal-telefono') { accoppiamento.annulla(attesa.id); return connessione.chiudi('PAIR_CANCELLED'); }
      if (esito.esito !== 'confermato') {
        await scrivi(stream, messaggioDiErrore(esito.esito === 'rifiutato' ? 'PAIR_REJECTED' : 'PAIR_EXPIRED'));
        return connessione.chiudi(esito.esito === 'rifiutato' ? 'PAIR_REJECTED' : 'PAIR_EXPIRED');
      }
      /* Il telefono l'ha già registrato chi ha chiamato `conferma()` (qui sotto), PRIMA di risvegliare questa attesa. */
      const dispositivo = esito.dispositivo;
      await scrivi(stream, { t: 'pair.ok', dispositivo: { id: dispositivo.id, nome: dispositivo.nome }, pc: { id: pcId, nome: nomePc, programma, vapid: vapidPubblica, ...(effimero === true ? { effimero: true } : {}), ...conCapacita } });
      await stream.finisci();
      /* half-close: si chiude la connessione solo quando il telefono ha chiuso il suo lato (quindi ha letto `pair.ok`) o è caduto */
      let tetto;
      await Promise.race([fineLettura, connessione.chiusa ?? new Promise(() => {}), new Promise((r) => { tetto = setTimeout(r, attesaDopoPairOkMs); tetto.unref?.(); })]);
      clearTimeout(tetto);
      return connessione.chiudi('DONE');
    } catch (e) {
      if (attesa) accoppiamento.annulla(attesa.id);
      try { await scrivi(stream, messaggioDiErrore(e.code === 'TOO_LARGE' || e.code === 'VERSION_UNSUPPORTED' ? e.code : 'BAD_MESSAGE')); } catch { /* già chiuso */ }
      return connessione.chiudi(e.code ?? 'BAD_MESSAGE');
    }
  }

  async function lavora(connessione) {
    const { stream, remoteId } = connessione;
    /* B.1: l'elenco PRIMA di leggere un byte. */
    const dispositivo = await dispositivi.ammesso(remoteId);
    if (!dispositivo) {
      try { await scrivi(stream, messaggioDiErrore('NOT_PAIRED')); } catch { /* chi non è ammesso non merita attese */ }
      return connessione.chiudi('NOT_PAIRED');
    }
    let insieme = vive.get(dispositivo.id);
    if (!insieme) { insieme = new Set(); vive.set(dispositivo.id, insieme); }
    insieme.add(connessione);
    avvisa({ tipo: 'telefono-collegato', id: dispositivo.id });
    dispositivi.visto?.(dispositivo.id)?.catch?.(() => {});
    const iscrizioni = new Map();
    const filo = scrittureInOrdine(stream);
    /* gli `n` di questa connessione in fila o al lavoro: lo stesso `n` mentre gira non dà una seconda risposta */
    const presenti = new Set();
    /* N5: gli `n` dei `.fetch` fermati prima di partire, e dei `.fetch-stop` che ne hanno fermato qualcuno */
    const fermate = new Set();
    const conFermate = new Set();
    const rispondiOra = async (m, consegna) => {
      let risposta;
      /* Ciò che deve succedere DOPO che il telefono ha la risposta (chiudere la connessione dopo «Dimentica questo computer»). */
      const dopo = [];
      try {
        /* 26/10/2026 (Mobile, contratto `spazio`): un PC già accoppiato e poi aggiornato dice chi è e che cosa sa fare anche alla
           RICONNESSIONE, non solo in `pair.code`/`pair.ok`. Sola lettura, dal servizio stesso (non è una rotta HTTP). Un PC più vecchio
           risponde UNKNOWN_OPERATION, che il telefono legge come «nessuna capacità». */
        if (fermate.delete(m.n)) throw Object.assign(new Error('The computer refused this action.'), { code: 'GIT_ABORTED', stato: 409 });
        const haFermato = conFermate.delete(m.n);
        const data = m.op === 'pc.info'
          ? { id: pcId, nome: nomePc, programma, ...(effimero === true ? { effimero: true } : {}), ...conCapacita }
          : await operazioni.esegui(m.op, m.args ?? {}, {
          dispositivo, n: m.n, iscrizioni, dopoLaRisposta: (fn) => { dopo.push(fn); },
          /* un'iscrizione agli eventi: `emetti` manda sullo stesso stream; `fine` la chiude quando si chiude la connessione */
          iscrivi: (sub, chiudi) => { iscrizioni.set(sub, chiudi); return (data) => scrivi(filo, { t: 'evt', sub, data }); },
        });
        risposta = { t: 'res', n: m.n, ok: true, data: haFermato && data ? { ...data, fermato: true } : (data ?? null) };
      } catch (e) {
        /* D-37: prima il filtro, poi il taglio: un percorso a cavallo dei 300 caratteri uscirebbe a metà, e a metà il filtro non lo riconosce */
        risposta = { t: 'res', n: m.n, ok: false, code: typeof e?.code === 'string' ? e.code : 'OPERATION_FAILED', message: senzaPercorsiAssoluti(String(e?.message ?? '')).slice(0, 300),
          ...motivoPerIlTelefono(e), // D-RM4-5: il telefono sceglie la frase giusta dal motivo, come la finestra del PC
          ...spiegazionePerIlTelefono(e), // Mobile 27/10/2026: la frase precisa, come la vede la finestra del PC
          /* RA-04 (Mobile, 20/10/2026): lo stato HTTP della rotta, quando c'è. Senza, il telefono lo ricavava dal codice e per i codici
             che non conosce metteva 500: una risposta rifiutata per validazione (400/422) o non più attuale (409) diventava «esito
             incerto» e la carta restava bloccata. Solo un intero fra 400 e 599: mai un numero che arrivi da altrove. */
          ...(Number.isInteger(e?.stato) && e.stato >= 400 && e.stato <= 599 ? { stato: e.stato } : {}) };
      }
      /* D-29: `codifica` lancia oltre il tetto del filo, e fuori dal `try` qui sopra quel lancio chiudeva la connessione con tutte le iscrizioni. Una risposta troppo grande è il
         rifiuto di QUELLA richiesta; si ricorda il rifiuto, o lo stesso `n` la rifarebbe. Le voci con molte righe hanno il loro tetto: questa è la rete per tutte le altre. */
      let uscita;
      try { uscita = codifica(risposta); } catch (e) {
        if (e?.code !== 'TOO_LARGE') throw e;
        /* revisione del blocco 25 (R10): una frase sola per codice — quella del filo, del server e del dizionario del PC */
        risposta = { t: 'res', n: m.n, ok: false, code: 'TOO_LARGE', message: `A message cannot exceed ${BYTE_MASSIMI} bytes.`, stato: 413 };
        uscita = codifica(risposta);
      }
      if (!RISPOSTE_NON_RICORDATE.has(m.op)) ricorda(dispositivo.id, m.n, risposta);
      consegna(risposta);
      presenti.delete(m.n); // da qui lo stesso `n` è una richiesta nuova, che trova la risposta ricordata
      await filo.scrivi(uscita);
      for (const fn of dopo) { try { await fn(); } catch { /* la risposta è già partita */ } }
    };
    /* ⛔ Il posto in `inVolo` si prende prima del primo `await`: controllo e presa stanno nello stesso giro, e due connessioni non passano insieme */
    const rispondi = async (m) => {
      if (RISPOSTE_NON_RICORDATE.has(m.op)) return rispondiOra(m, () => {});
      const voli = inVolo.get(dispositivo.id) ?? new Map();
      inVolo.set(dispositivo.id, voli);
      let consegna;
      voli.set(m.n, new Promise((r) => { consegna = r; }));
      try { return await rispondiOra(m, consegna); } finally {
        consegna(null);
        voli.delete(m.n);
        if (!voli.size && inVolo.get(dispositivo.id) === voli) inVolo.delete(dispositivo.id);
      }
    };
    const lunghe = new Map();
    /* F2: un guasto del filo resta un errore anche qui; se nemmeno quello si scrive, la connessione è chiusa e lo vede il ciclo */
    const accanto = (m, lavoro) => { lunghe.set(m.n, lavoro.catch(() => scrivi(filo, messaggioDiErrore('BAD_MESSAGE', { n: m.n })).catch(() => {})).finally(() => { lunghe.delete(m.n); presenti.delete(m.n); })); };
    /* Lo stesso `n` già risposto, o al lavoro su un'altra connessione: la prima risposta vale per tutte. `null` se è nuovo. ⛔ Sincrona: fra questo controllo e `rispondi` nessun `await` (SRV-26) */
    const giaVista = (m) => {
      const gia = giaRisposta(dispositivo.id, m.n);
      if (gia) return scrivi(filo, gia);
      const altrove = inVolo.get(dispositivo.id)?.get(m.n);
      if (!altrove) return null;
      presenti.add(m.n);
      accanto(m, altrove.then((r) => (r ? filo.scrivi(codifica(r)) : undefined)));
      return Promise.resolve();
    };
    let inMano = null; // la voce uscita dalla fila e non ancora partita: aspetta l'elenco o un posto
    const dallaFila = async (m) => {
      inMano = m;
      if (!(await dispositivi.ammesso(remoteId))) { inMano = null; await scrivi(filo, messaggioDiErrore('REVOKED')); return false; }
      /* ⛔ L'attesa di un posto sta prima dei controlli: fra il controllo e `rispondi` nessun `await`, o lo stesso `n` partirebbe intanto da un'altra connessione (SRV-26) */
      if (VOCI_LUNGHE.has(m.op) && lunghe.size >= VOCI_LUNGHE_INSIEME && !fermate.has(m.n)) await Promise.race(lunghe.values());
      inMano = null;
      const ripetuta = giaVista(m);
      if (ripetuta) { fermate.delete(m.n); await ripetuta; return true; }
      if (!VOCI_LUNGHE.has(m.op)) { await rispondi(m); return true; }
      accanto(m, rispondi(m));
      return true;
    };
    let fila = [];
    const fermaInFila = (sessionId) => {
      if (typeof sessionId !== 'string') return 0; // un `.fetch-stop` senza sessione è rifiutato: non ferma niente
      const daFermare = [...fila, ...(inMano ? [inMano] : [])].filter((m) => m.op === VOCE_CHE_SI_FERMA && m.args?.sessionId === sessionId && !fermate.has(m.n));
      for (const m of daFermare) fermate.add(m.n);
      return daFermare.length;
    };
    const fileDelDispositivo = fileVive.get(dispositivo.id) ?? new Set();
    fileVive.set(dispositivo.id, fileDelDispositivo);
    fileDelDispositivo.add(fermaInFila);
    let lavoratore = null;
    let guasto = null;
    let spazio = () => {};
    let ferma;
    const fermata = new Promise((r) => { ferma = r; });
    const svuota = async () => {
      try {
        while (fila.length) {
          const m = fila.shift();
          spazio();
          const avanti = await dallaFila(m);
          if (!lunghe.has(m.n)) presenti.delete(m.n);
          if (!avanti) { fila = []; ferma(); }
        }
      } catch (e) { fila = []; guasto = e; ferma(); } finally { lavoratore = null; }
    };
    try {
      try {
        const giro = messaggi(stream);
        for (;;) {
          const letto = await Promise.race([giro.next(), fermata]);
          if (!letto || letto.done) break;
          const m = letto.value;
          const richiesta = m.t === 'req' && typeof m.n === 'string' && N_VALIDO.test(m.n) && typeof m.op === 'string';
          if (richiesta && presenti.has(m.n)) continue;
          if (richiesta && m.op !== VOCE_FUORI_FILA) {
            presenti.add(m.n);
            fila.push(m);
            lavoratore ??= svuota();
            if (fila.length >= FILA_MASSIMA) await Promise.race([new Promise((r) => { spazio = r; }), fermata]);
            continue;
          }
          if (!(await dispositivi.ammesso(remoteId))) { await scrivi(filo, messaggioDiErrore('REVOKED')); break; }
          if (m.t === 'ping') { await scrivi(filo, { t: 'pong', s: m.s ?? null }); continue; }
          if (m.t !== 'req') { await scrivi(filo, messaggioDiErrore('BAD_MESSAGE')); continue; }
          if (!richiesta) { await scrivi(filo, messaggioDiErrore('BAD_MESSAGE', { n: typeof m.n === 'string' ? m.n.slice(0, 64) : undefined })); continue; }
          /* N6: la stessa regola della fila. Senza, il secondo `.fetch-stop` riscriveva il posto del primo in `inVolo` */
          const ripetuta = giaVista(m);
          if (ripetuta) { await ripetuta; continue; }
          presenti.add(m.n);
          if ([...fileDelDispositivo].reduce((quante, ferma) => quante + ferma(m.args?.sessionId), 0) > 0) conFermate.add(m.n);
          accanto(m, rispondi(m));
        }
      } finally { await lavoratore; } // chi ha chiuso dopo aver chiesto riceve lo stesso le sue risposte, come quando la fila non c'era
      if (guasto) throw guasto;
    } catch (e) {
      try { await scrivi(filo, messaggioDiErrore(e.code === 'TOO_LARGE' || e.code === 'VERSION_UNSUPPORTED' ? e.code : 'BAD_MESSAGE')); } catch { /* già chiuso */ }
    } finally {
      for (const chiudi of iscrizioni.values()) { try { chiudi?.(); } catch { /* niente */ } }
      fileDelDispositivo.delete(fermaInFila);
      if (!fileDelDispositivo.size && fileVive.get(dispositivo.id) === fileDelDispositivo) fileVive.delete(dispositivo.id);
      insieme.delete(connessione);
      if (!insieme.size) { vive.delete(dispositivo.id); avvisa({ tipo: 'telefono-scollegato', id: dispositivo.id }); }
      connessione.chiudi('DONE');
    }
  }

  return {
    /** Il punto d'ingresso del trasporto, una volta per connessione accettata. */
    gestisci(connessione) {
      if (connessione.alpn === ALPN_ACCOPPIAMENTO) return accoppia(connessione);
      if (connessione.alpn === ALPN_LAVORO) return lavora(connessione);
      connessione.chiudi('UNKNOWN_ALPN');
      return Promise.resolve();
    },

    /** «Collega» sul PC: registra il telefono, poi sveglia la connessione d'accoppiamento che aspetta. */
    async conferma(idAttesa) {
      const d = accoppiamento.dati(idAttesa);
      const voce = await dispositivi.aggiungi({ endpointId: d.telefonoId, nome: d.nome, piattaforma: d.piattaforma, sveglia: d.sveglia });
      /* Se l'attesa è scaduta mentre si scriveva il file, il telefono non lo saprà mai: la voce appena scritta si ritira. */
      try { accoppiamento.conferma(idAttesa, { dispositivo: voce }); } catch (e) { await dispositivi.revoca(voce.id, 'pc').catch(() => {}); throw e; }
      return voce;
    },

    rifiuta(idAttesa) { return accoppiamento.rifiuta(idAttesa); },

    /** Revoca dal PC: l'elenco prima, poi la chiusura SUBITO delle connessioni vive. */
    async revoca(id, da = 'pc') {
      const voce = await dispositivi.revoca(id, da);
      for (const c of vive.get(id) ?? []) { try { c.chiudi('REVOKED'); } catch { /* niente */ } }
      vive.delete(id);
      ricordate.delete(id);
      return voce;
    },

    /** Chi è in linea adesso (il pallino verde dell'icona). */
    inLinea() { return [...vive.keys()]; },

    /** Per i vivi, il percorso di adesso (mockup: «diretto, 38 ms»), dal trasporto: `{ tipo: 'diretto'|'relay', rttMs }`. */
    percorsi() {
      const fuori = {};
      for (const [id, insieme] of vive) {
        for (const c of insieme) { let p = null; try { p = c.percorso?.() ?? null; } catch { p = null; } if (p) { fuori[id] = p; break; } }
      }
      return fuori;
    },
  };
}
