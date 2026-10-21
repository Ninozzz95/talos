/*
 * Controllo remoto — la SVEGLIA del telefono (contratto v0.3 §E e §10; misure di Nino3 del 17/10: 11/11 consegnate in Doze ad app
 * uccisa, mediana 691 ms, senza nessun progetto Firebase nostro).
 *
 * Il PC manda un Web Push (RFC 8030/8291, aes128gcm) firmato con la SUA VAPID verso l'iscrizione che il telefono ha dato
 * all'accoppiamento. Il carico è `{"v":1,"w":"<id opaco>"}` e nient'altro: niente titolo, niente nome di conversazione, niente testo
 * (Sygnal `event_id_only`). Il telefono si sveglia, si collega e legge le novità dal canale cifrato.
 *
 * Quando (contratto §10, e Nino3 §18.2 «ogni sveglia diventa una notifica visibile»): SOLO per ciò che serve alla persona —
 *   · una carta di permesso, una domanda, una scheda del piano, una richiesta di un server MCP che aspetta;
 *   · la fine di un giro lungo (oltre 2 minuti).
 * Mai per ogni evento. Un telefono COLLEGATO non si sveglia se CONFERMA di aver mostrato la carta (`device.seen`, sotto); se non la
 * conferma entro la grazia, si sveglia lo stesso.
 * Tetti: al più una sveglia ogni 10 s per telefono; più cose ravvicinate diventano una sveglia sola. Un'iscrizione che il servizio
 * rifiuta per sempre (404/410) si dimentica: è il `WAKE_TOKEN_INVALID` di Nino3 — il telefono ne registrerà una nuova.
 *
 * Il ritmo: si guarda l'elenco delle sessioni (lo stesso della barra laterale) ogni 5 s e si confrontano gli stati con il giro
 * prima. Il primo giro fa solo da base: ciò che aspettava già non sveglia nessuno.
 */

import { randomBytes } from 'node:crypto';

export const INTERVALLO_MS = 5_000;
export const SVEGLIE_MINIME_MS = 10_000;
export const GIRO_LUNGO_MS = 2 * 60_000;
/*
 * Revisione del Mobile, 21/10/2026 (prova dal vivo sul 4178): «collegato» NON vuol dire «visto».
 *   · L'app collegata mostra solo le carte della sessione aperta nel Codice remoto, non quelle delle altre.
 *   · Un'app uccisa dal sistema lascia la connessione QUIC «in linea» fino al timeout d'inattività (~30 s misurati), anche iscritta.
 *   · Il job della sveglia si collega pochi secondi, mette la notifica e chiude.
 * ⇒ Una novità esce dalla coda di un telefono SOLO con la sua conferma esplicita, `device.seen { sessionId }`: il Codice la manda
 *   quando la carta è disegnata con l'app in primo piano. Senza conferma, a telefono scollegato la sveglia parte appena il tetto lo
 *   consente; a telefono collegato dopo questa grazia (una connessione morta che sembra viva costa al più la grazia, non la sveglia).
 */
export const GRAZIA_COLLEGATO_MS = 10_000;
const VISTE_MASSIME = 256; // conferme ricordate per telefono
export const TTL_S = 60 * 60; // un'ora: una carta che aspetta resta da dire anche se il telefono era senza rete

/*
 * Owner, 21/10/2026 (dal Mobile, col dossier 10×4): richieste (permesso, domanda, piano, MCP) ad ALTA importanza; giro lungo finito E
 *   giro FALLITO di serie su un canale più basso; NIENTE dalle sotto-sessioni.
 *   · Una figlia non sveglia mai da sola: quando aspetta la persona, aspetta la MADRE (`inAttesaDiscendente`, C2-R7, la stessa carta
 *     che la madre mostra), e la madre è una sessione di primo livello come le altre.
 *   · Un giro fallito sveglia SEMPRE, anche corto: un errore è da guardare anche dopo 20 secondi (un giro finito bene sveglia solo
 *     oltre i 2 minuti, come prima). Fermato dalla persona o messo in pausa NON è un fallimento.
 *   · ⛔ Owner, 21/10/2026 sera («Subito, ma discrete», dossier del Mobile `2026-10-21-urgenza-fini-sveglia.md`): TUTTE le sveglie
 *     partono con `Urgency: high` (RFC 8030 §5.3). Con `normal` FCM consegna solo nelle finestre di manutenzione della Doze: provato dal
 *     Mobile il 21/10, tre fini arrivate insieme solo allo sblocco. Il «più basso» delle fini è il CANALE di notifica sul telefono
 *     («Lavori finiti»), non l'urgenza del trasporto; FCM declassa solo gli high che non diventano una notifica, e le nostre la mostrano
 *     sempre. Il carico resta vuoto, il telefono legge il resto dal canale cifrato.
 */
const eUnaFiglia = (s) => Boolean(s.padreId) || Number(s.profonditaDelega) > 0;
const eUnPasso = (s) => Boolean(s.passoWorkflow);
/* Revisione del 21/10 (rossa, S4): la madre aspetta per la figlia solo per un permesso o una domanda (`inAttesaDiscendente`, C2-R7);
   la richiesta di un server MCP di una figlia NON arriva alla madre, quindi sveglia per sé (si apre la sessione della figlia). Un
   passo di Workflow non ha madre: le sue attese svegliano per sé, le sue fini no (sono del run, non della persona). */
const aspettaLaPersona = (s) => (eUnaFiglia(s)
  ? Boolean(s.inAttesaRichiestaMcp || s.inAttesaPiano)
  : Boolean(s.inAttesaApprovazione || s.inAttesaDomanda || s.inAttesaPiano || s.inAttesaRichiestaMcp || s.inAttesaDiscendente));
const finitoMale = (s) => Boolean(s.conclusa) && s.ultimoEsito === 'errore' && s.motivoChiusura !== 'fermata' && s.motivoChiusura !== 'in-pausa';
const istante = (x) => (typeof x === 'string' && Number.isFinite(Date.parse(x)) ? Date.parse(x) : null);

/**
 * `invia(iscrizione, carico, opzioni)` è `web-push.sendNotification` (iniettato: le prove non escono in rete). `vapid` è
 * `{ publicKey, privateKey }` del PC. `soggetto`: il contatto VAPID (RFC 8292 §2.1), un mailto: o un https:.
 */
export function creaSveglia({
  elenca, dispositivi, inLinea, vapid, invia, soggetto = 'mailto:talos@localhost.invalid',
  clock = () => Date.now(), casuale = (n) => randomBytes(n), avvisa = () => {},
} = {}) {
  let prima = null; // sessionId → { aspetta, conclusa, avviataAlle }
  const ultimaPer = new Map(); // id telefono → ms dell'ultima sveglia
  /* telefono → { urgenza ('high' vince su 'normal'), sessioni: Map sessionId → ms in cui il giro ha visto la novità }: la sveglia da
     mandare (rimandata dal tetto dei 10 s, o in grazia perché il telefono è collegato) */
  const daMandare = new Map();
  /* telefono → Map sessionId → ms dell'ultima conferma: il telefono riceve gli eventi SUBITO e può confermare una carta prima che il giro
     (ogni 5 s) si accorga della novità; una conferma arrivata dopo il giro prima vale per la novità che questo giro scopre */
  const visteAlle = new Map();
  let giroPrimaAlle = -Infinity;

  /** Le novità fra due giri: `richieste` (qualcosa che ADESSO aspetta la persona) e `fini` (un giro lungo finito, o fallito). */
  function novita(sessioni) {
    const ora = clock();
    const adesso = new Map(sessioni.map((s) => [s.sessionId, {
      aspetta: aspettaLaPersona(s), contaLaFine: !eUnaFiglia(s) && !eUnPasso(s), conclusa: Boolean(s.conclusa), fallito: finitoMale(s),
      inizio: istante(s.inizioGiroAlle), fine: istante(s.fineGiroAlle), avviataAlle: istante(s.avviataAlle) }]));
    const richieste = []; const fini = [];
    if (prima) {
      for (const [id, s] of adesso) {
        const p = prima.get(id);
        if (s.aspetta && !p?.aspetta) richieste.push(id);
        if (!s.contaLaFine || !s.conclusa || !p) continue;
        /* Revisione del 21/10 (rossa, S3): un giro NUOVO finito si riconosce dalla sua fine (`fineGiroAlle` cambiata), anche se è
           iniziato e finito fra due sguardi; la durata è quella del giro. Senza i due campi (un elenco di prima), come prima. */
        const nuovaFine = s.fine !== null ? s.fine !== p.fine : !p.conclusa;
        const durata = s.fine !== null && s.inizio !== null ? s.fine - s.inizio : (s.avviataAlle ? ora - s.avviataAlle : 0);
        if (nuovaFine && (s.fallito || durata >= GIRO_LUNGO_MS)) fini.push(id);
      }
    }
    prima = adesso;
    return { richieste, fini };
  }

  /** il telefono ha confermato la sessione `id` DOPO `dal`: per una novità che il giro ha scoperto dopo quell'istante */
  function confermata(idTelefono, id, dal) {
    const alle = visteAlle.get(idTelefono)?.get(id);
    return alle !== undefined && alle > dal;
  }

  /** Una sveglia a un telefono: 'inviata', 'senza-iscrizione', 'dimenticata' (404/410) o 'fallita'. */
  async function sveglia(telefono, urgenza = 'high', { prova = false } = {}) {
    const iscrizione = await dispositivi.iscrizione(telefono.id);
    if (!iscrizione) return 'senza-iscrizione';
    /* `p: 1` = «Prova la notifica» (revisione del Mobile, 21/10): il telefono la distingue da una sveglia vera senza segni a tempo.
       Nessun dato in più per chi trasporta la spinta: il carico è cifrato (aes128gcm) e resta senza contenuto. */
    const carico = JSON.stringify({ v: 1, w: Buffer.from(casuale(12)).toString('base64url'), ...(prova ? { p: 1 } : {}) });
    try {
      await invia(iscrizione, carico, {
        TTL: TTL_S, urgency: urgenza, contentEncoding: 'aes128gcm', timeout: 10_000,
        vapidDetails: { subject: soggetto, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      });
      ultimaPer.set(telefono.id, clock());
      return 'inviata';
    } catch (e) {
      const stato = e?.statusCode;
      if (stato === 404 || stato === 410) {
        await dispositivi.aggiornaSveglia(telefono.id, null).catch(() => {});
        avvisa({ tipo: 'sveglia-dimenticata', id: telefono.id });
        return 'dimenticata';
      }
      avvisa({ tipo: 'sveglia-fallita', id: telefono.id, motivo: String(stato ?? e?.message ?? e).slice(0, 120) });
      return 'fallita';
    }
  }

  return {
    /** Un giro: confronta, e sveglia chi serve. Torna quante sveglie sono partite (per le prove). */
    async giro() {
      let sessioni = [];
      try { sessioni = elenca() ?? []; } catch { return 0; }
      const { richieste, fini } = novita(sessioni);
      const vivi = new Set(inLinea());
      const telefoni = (await dispositivi.elenca()).filter((v) => !v.revocatoAlle && v.sveglia);
      const urgenza = richieste.length > 0 || fini.length > 0 ? 'high' : null; // owner 21/10 sera: anche le fini, vedi in testa
      const ora = clock();
      /* in coda anche un telefono COLLEGATO: esce solo con la sua conferma (`visto`) */
      if (urgenza) {
        for (const t of telefoni) {
          let q = daMandare.get(t.id);
          if (!q) { q = { urgenza, sessioni: new Map() }; daMandare.set(t.id, q); }
          else if (q.urgenza !== 'high') q.urgenza = urgenza;
          for (const id of [...richieste, ...fini]) q.sessioni.set(id, ora); // una novità nuova va confermata di nuovo
        }
      }
      let partite = 0;
      for (const t of telefoni) {
        const q = daMandare.get(t.id);
        if (!q) continue;
        /* già confermate (anche prima che questo giro le scoprisse) */
        for (const id of q.sessioni.keys()) if (confermata(t.id, id, giroPrimaAlle)) q.sessioni.delete(id);
        if (!q.sessioni.size) { daMandare.delete(t.id); continue; }
        if (vivi.has(t.id) && ora - Math.min(...q.sessioni.values()) < GRAZIA_COLLEGATO_MS) continue; // collegato: tempo per confermare
        if (ora - (ultimaPer.get(t.id) ?? -Infinity) < SVEGLIE_MINIME_MS) continue; // tetto: resta in coda, partirà al giro buono
        daMandare.delete(t.id);
        await sveglia(t, q.urgenza);
        partite += 1;
      }
      /* revocato o senza sveglia nel frattempo: niente da mandare */
      const iscritti = new Set(telefoni.map((t) => t.id));
      for (const id of [...daMandare.keys()]) if (!iscritti.has(id)) daMandare.delete(id);
      for (const id of [...visteAlle.keys()]) if (!iscritti.has(id)) visteAlle.delete(id);
      giroPrimaAlle = ora;
      return partite;
    },

    /**
     * `device.seen` (Mobile, 21/10/2026): il telefono ha mostrato la carta di `sessionId` con l'app in primo piano. Vale per QUELLA
     * sessione sola, per le novità nate fino ad ADESSO: una novità successiva va confermata di nuovo. Idempotente.
     * ⛔ Revisione del 21/10 (S4): NON per le discendenti. Le carte di permesso e domanda di una figlia che la madre disegna (C2-R7) sono
     *   già novità della MADRE (`inAttesaDiscendente`); MCP e piano di una figlia la madre non li disegna, e confermare la madre le
     *   toglieva dalla coda senza che nessuno le avesse viste.
     */
    visto(idTelefono, sessionId) {
      const ora = clock();
      let perTelefono = visteAlle.get(idTelefono);
      if (!perTelefono) { perTelefono = new Map(); visteAlle.set(idTelefono, perTelefono); }
      perTelefono.set(sessionId, ora);
      while (perTelefono.size > VISTE_MASSIME) perTelefono.delete(perTelefono.keys().next().value);
      const q = daMandare.get(idTelefono);
      if (!q) return;
      const nata = q.sessioni.get(sessionId);
      if (nata !== undefined && nata <= ora) q.sessioni.delete(sessionId);
      if (!q.sessioni.size) daMandare.delete(idTelefono);
    },

    /**
     * «Prova la notifica» (R-M5, Mobile 21/10/2026, `device.wake.test`): UNA sveglia adesso a quel telefono, anche se è collegato
     * (è lui a chiederla), sotto lo stesso tetto di una ogni 10 s. Torna `{ esito, attendiMs? }`: 'troppo-presto' col tempo che manca.
     */
    async svegliaOra(id) {
      const manca = SVEGLIE_MINIME_MS - (clock() - (ultimaPer.get(id) ?? -Infinity));
      if (manca > 0) return { esito: 'troppo-presto', attendiMs: manca };
      /* ⛔ Revisione del 21/10 (S4): il tempo si PRENOTA prima dell'invio, nello stesso passo sincrono del controllo, e resta anche se
         l'invio fallisce. Prima si scriveva solo a invio riuscito: 5 prove con l'invio che falliva facevano 5 POST, e 3 prove in
         parallelo 3 POST. Una sveglia senza iscrizione, o con l'iscrizione dimenticata (404/410), non ha mandato niente di utile:
         libera il posto, così la prova dopo la nuova iscrizione non aspetta. */
      const prima = ultimaPer.get(id);
      ultimaPer.set(id, clock());
      const esito = await sveglia({ id }, 'high', { prova: true });
      if (esito === 'senza-iscrizione' || esito === 'dimenticata') { if (prima === undefined) ultimaPer.delete(id); else ultimaPer.set(id, prima); }
      return { esito };
    },

    /** Il ritmo vero: ogni 5 s. Torna la funzione che lo ferma. */
    avvia(timer = globalThis) {
      let fermo = false;
      const t = timer.setInterval(() => { if (!fermo) void this.giro().catch(() => {}); }, INTERVALLO_MS);
      t?.unref?.();
      return () => { fermo = true; timer.clearInterval(t); };
    },
  };
}
