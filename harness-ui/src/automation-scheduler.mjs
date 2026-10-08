/**
 * automation-scheduler.mjs — il tick che fa partire un'automazione DA SOLA,
 * senza che l'owner prema nulla. La seconda metà del blocco 7, dopo
 * `automation-store.mjs` (persistenza + guardie). Owner, 27/8: "hai il mio
 * via libera" sulla vera schedulazione.
 *
 * ⛔ `unTick()` è la funzione PURA che fa tutto il lavoro — nessun timer al
 * suo interno, `clock` e `sessionRegistry.avvia` iniettabili. `avvia()`/
 * `ferma()` sotto sono il SOLO punto che tocca `setInterval` per davvero,
 * e restano fuori da qualunque test: "mai un vero timer nei test unitari"
 * è la stessa disciplina già in uso in tutto il progetto per il tempo.
 *
 * ⛔⛔⛔ AUTOMAZIONI A DUE PORTE (owner 08/10/2026 notte) — le voci v2 girano così, «come Hermes, minimo 5 minuti» (D1):
 * - MAI due giri sovrapposti della stessa automazione: se il precedente è ancora vivo, questo si scrive «saltato» col motivo
 *   (Hermes, la presa del lavoro in `cron/executions.py`; Claude Desktop: «the previous run was still in progress»);
 * - un ritardo oltre la grazia (`automation-pianificazione.mjs`) gira UNA volta sola, adesso: i giri persi non si recuperano
 *   uno per uno (Hermes `jobs.py:956-963`); oltre i 7 giorni non si recupera nemmeno quello (Claude Desktop, «missed any runs
 *   in the last seven days»), e «una volta» oltre la grazia si salta (Hermes `ONESHOT_GRACE_SECONDS`);
 * - la risposta finale decide lo storico (`automation-giro.mjs`): `[SILENT]` ⇒ archiviato senza disturbare,
 *   `[AUTOMATION_FAILURE]` o un errore ⇒ fallito e «Da guardare», il resto ⇒ «Da guardare»;
 * - un 429 col tempo dichiarato dal fornitore parcheggia l'automazione fino alla riapertura (Hermes `cron/quota_hold.py`);
 * - un giro rimasto aperto da un riavvio si chiude leggendo il suo FILE (`leggiEsitoSessioneDiPasso`), mai inventando.
 * Le voci v1 (task del corpus) girano come prima, ramo per ramo.
 */
import { randomUUID } from 'node:crypto';

import { CHIAVE_COORDINAZIONE } from './coordinazione.mjs';
import { classificaRitardo, graziaSecondi } from './automation-pianificazione.mjs';
import { consegnaDelGiro, esitoDellaRisposta } from './automation-giro.mjs';
import { leggiAttesaResetDalCorpo } from './provider-retry.mjs';

const RECUPERO_MASSIMO_MS = 7 * 24 * 3_600_000;

export function createAutomationScheduler({
  store, sessionRegistry, clock = () => new Date(), onEsecuzione = () => {}, onGiroFinito = () => {},
  puoCambiareSeStessa = false,
}) {
  /* Le automazioni con un giro avviato DA QUESTA istanza e non ancora chiuso: la guardia contro la sovrapposizione che non
     dipende dal disco (il disco la porta dopo un riavvio, con `giroInCorso`). */
  const inVolo = new Set();

  /** v2: legge la fine di un giro e la scrive nello storico. */
  async function chiudiConEsito(automazioneId, runId, r) {
    const letto = esitoDellaRisposta(r?.testoFinale ?? '');
    let esito;
    let riassunto;
    let motivo = null;
    if (r?.esito === 'cancelled') {
      esito = 'fermata'; riassunto = null; motivo = 'fermata';
    } else if (r?.esito === 'succeeded' && !letto.fallimento) {
      esito = 'finita'; riassunto = r.testoFinale || null;
    } else {
      esito = 'fallita';
      riassunto = letto.fallimento ?? r?.messaggioErrore ?? null;
      motivo = letto.fallimento ? 'dichiarato' : (r?.classeErrore ?? r?.esito ?? 'interrotta');
    }
    const daGuardare = esito === 'fallita' || (esito === 'finita' && !letto.silenzio);
    await store.chiudiGiro(automazioneId, runId, { esito, riassunto, daGuardare, motivo });
    if (r?.classeErrore === 'traffico') {
      const attesaMs = leggiAttesaResetDalCorpo(r.messaggioErrore ?? '');
      if (attesaMs !== null) await store.inAttesaFino(automazioneId, new Date(clock().getTime() + attesaMs).toISOString());
    }
    onGiroFinito({ automazioneId, runId, esito, daGuardare, silenzio: letto.silenzio, riassunto });
  }

  /**
   * v2: fa partire un giro adesso. `{ok:false, code}` se è già in corso o l'avvio è rifiutato (scritto nello storico come
   * saltato col motivo); `{ok:true, runId, sessionId}` altrimenti.
   */
  async function avviaGiroV2(voce, { previstaAlle = null, ritardo = null, manuale = false, contesto = null } = {}) {
    if (giroVivo(voce)) return { ok: false, code: 'AUTOMATION_RUN_IN_PROGRESS' };
    inVolo.add(voce.id);
    const runId = randomUUID();
    let avvio;
    try {
      avvio = sessionRegistry.avviaGiroAutomazione({
        automazioneId: voce.id, runId, cartella: voce.cartella, titolo: voce.nome, modello: voce.modello, permessi: voce.permessi,
        permessiPerAttrezzo: voce.coordinazione === true ? { [CHIAVE_COORDINAZIONE]: 'sempre' } : {},
        consegna: consegnaDelGiro({ nome: voce.nome, istruzioni: voce.istruzioni, numero: voce.eseguite + 1, contesto, puoCambiareSeStessa }),
      });
    } catch (errore) {
      inVolo.delete(voce.id);
      throw errore;
    }
    if (!avvio || 'erroreAvvio' in avvio) {
      inVolo.delete(voce.id);
      await store.saltaGiro(voce.id, { previstaAlle, motivo: avvio?.code ?? 'avvio-rifiutato', dettaglio: avvio?.erroreAvvio ?? null, daGuardare: true });
      onEsecuzione({ automazione: voce, esito: avvio, runId: null });
      return { ok: false, code: avvio?.code ?? 'AUTOMATION_RUN_NOT_STARTED', erroreAvvio: avvio?.erroreAvvio ?? null };
    }
    await store.apriGiro(voce.id, { runId, previstaAlle, sessionId: avvio.sessionId, ritardo, manuale });
    onEsecuzione({ automazione: voce, esito: avvio, runId });
    Promise.resolve(avvio.fine)
      .then((r) => chiudiConEsito(voce.id, runId, r))
      .catch((errore) => store.chiudiGiro(voce.id, runId, { esito: 'fallita', daGuardare: true, motivo: 'interrotta',
        riassunto: errore instanceof Error ? errore.message : String(errore) }).catch(() => {}))
      .finally(() => inVolo.delete(voce.id));
    return { ok: true, runId, sessionId: avvio.sessionId };
  }

  /** v2: un giro rimasto aperto da un riavvio (o perso): si chiude dal FILE della sua sessione. */
  async function riconcilia(voce) {
    const { runId, sessionId } = voce.giroInCorso;
    const r = await sessionRegistry.leggiEsitoSessioneDiPasso?.({ sessionId });
    if (r && r.esito !== 'in-corso') return chiudiConEsito(voce.id, runId, r);
    if (!r) await store.chiudiGiro(voce.id, runId, { esito: 'fallita', daGuardare: true, motivo: 'interrotta', riassunto: null });
    return undefined;
  }

  /** Un giro di questa automazione è vivo: avviato da questa istanza e non chiuso, o in corso per il registro. */
  function giroVivo(voce) {
    return inVolo.has(voce.id) || (Boolean(voce.giroInCorso) && sessionRegistry.statoGiroAutomazione?.(voce.giroInCorso.sessionId) === 'in-corso');
  }

  async function tickV2(voce, ora) {
    if (!inVolo.has(voce.id) && voce.giroInCorso && sessionRegistry.statoGiroAutomazione?.(voce.giroInCorso.sessionId) !== 'in-corso') {
      await riconcilia(voce);
      voce = (await store.leggi(voce.id)) ?? voce;
    }
    if (!voce.attiva || !voce.prossimaEsecuzione) return;
    const prevista = new Date(voce.prossimaEsecuzione);
    if (ora < prevista) return;
    if (voce.inAttesaFinoA && ora < new Date(voce.inAttesaFinoA)) return;
    if (giroVivo(voce)) {
      await store.saltaGiro(voce.id, { previstaAlle: voce.prossimaEsecuzione, motivo: 'precedente-in-corso' });
      return;
    }
    const ritardoMs = ora.getTime() - prevista.getTime();
    const ritardo = classificaRitardo(ritardoMs / 1000, graziaSecondi(voce.pianificazione, { fusoOrario: voce.fusoOrario }));
    if (ritardo === 'recupero' && (voce.pianificazione.tipo === 'una-volta' || ritardoMs > RECUPERO_MASSIMO_MS)) {
      await store.saltaGiro(voce.id, { previstaAlle: voce.prossimaEsecuzione, motivo: 'app-chiusa' });
      return;
    }
    await avviaGiroV2(voce, { previstaAlle: voce.prossimaEsecuzione, ritardo });
  }

  /**
   * Un giro su TUTTE le automazioni: quelle attive, con `prossimaEsecuzione`
   * già passata, e sotto il loro `limiteAlGiorno`, fanno partire una
   * sessione vera — esattamente come "Esegui ora", solo senza il click.
   *
   * ⛔ Il limite raggiunto NON fa ritentare a ogni giro (sarebbe spam):
   * l'automazione resta ferma fino a domani, quando `registraEsecuzione`
   * (chiamata dal PROSSIMO avvio riuscito) azzera il contatore da sola.
   */
  async function eseguiTick() {
    const automazioni = await store.elenca();
    const ora = clock();
    const oggi = ora.toISOString().slice(0, 10);
    for (const voce of automazioni) {
      if (voce.versione === 2) {
        try { await tickV2(voce, ora); } catch { /* un'automazione rotta non ferma le altre: il prossimo tick riprova */ }
        continue;
      }
      if (!voce.attiva) continue;
      if (!voce.prossimaEsecuzione) continue;
      if (ora < new Date(voce.prossimaEsecuzione)) continue;
      const eseguiteOggi = voce.giornoContatore === oggi ? voce.eseguiteOggi : 0;
      if (eseguiteOggi >= voce.limiteAlGiorno) continue; // limite raggiunto: si tace fino a domani, non si ritenta ogni giro

      // ⛔ 24/09/2026, decisione owner 30: nessuna interfaccia segue un'automazione — una domanda del modello si chiude
      //   subito con l'ipotesi prudente dichiarata (`senzaInterfaccia`, session-registry.mjs).
      // 24/09/2026, decisione owner: con il modello salvato alla creazione; senza, il predefinito del server (detto a schermo).
      // C2b «Coordinazione» (owner 08/10/2026 notte): accesa nella scheda, l'esecuzione nasce col «sempre» sulla chiave della
      //   delega, quindi avvia agenti da sola entro il tetto; spenta (di serie) la carta d'avvio si nega subito, come prima.
      const esito = sessionRegistry.avvia(voce.taskId, {
        senzaInterfaccia: true,
        ...(typeof voce.modello === 'string' && voce.modello ? { modelloScelto: voce.modello } : {}),
        ...(voce.coordinazione === true ? { permessiPerAttrezzoScelto: { [CHIAVE_COORDINAZIONE]: 'sempre' } } : {}),
      });
      await store.registraEsecuzione(voce.id);
      onEsecuzione({ automazione: voce, esito });
    }
  }

  /*
   * ⛔ 14/09 (F06 della review, riprodotto): due giri sovrapposti facevano partire DUE VOLTE la stessa automazione — il
   *   secondo giro leggeva l'elenco prima che il primo avesse scritto `registraEsecuzione`, e una sessione vera costa.
   *   Un giro alla volta per questo scheduler: chi arriva mentre uno è in corso riceve lo STESSO giro, non ne apre un altro.
   * ⛔ Non è un «esattamente una volta» fra processi diversi né a prova di crash: è la guardia locale di questa istanza,
   *   e non pretende di essere altro.
   */
  let tickInCorso = null;
  async function unTick() {
    if (tickInCorso) return tickInCorso;
    tickInCorso = eseguiTick().finally(() => { tickInCorso = null; });
    return tickInCorso;
  }

  /**
   * v2, «Esegui ora» (dall'interfaccia o dal modello, con la carta): parte anche da spenta (Hermes: «explicit run remains
   * available»), mai sopra un giro ancora vivo. `contesto` arriva al modello come dato marcato, non come istruzioni.
   */
  async function eseguiOra(id, { contesto = null } = {}) {
    const voce = await store.leggi(id);
    if (!voce) return null;
    if (voce.versione !== 2) return { ok: false, code: 'AUTOMATION_LEGACY' };
    return avviaGiroV2(voce, { manuale: true, contesto });
  }

  /** v2: ferma il giro in corso (Goose `kill`). `null` se l'automazione non c'è, `{ok:false}` se non c'è un giro vivo. */
  async function fermaGiro(id) {
    const voce = await store.leggi(id);
    if (!voce) return null;
    const sessionId = voce.giroInCorso?.sessionId;
    if (!sessionId || sessionRegistry.statoGiroAutomazione?.(sessionId) !== 'in-corso') return { ok: false, code: 'AUTOMATION_NO_RUN_IN_PROGRESS' };
    sessionRegistry.ferma(sessionId, { daChi: 'persona' });
    return { ok: true, sessionId };
  }

  let timer = null;
  /** Mai chiamata nei test — questa È la linea che separa "logica provata" da "timer vero", vedi doc in testa al file. */
  function avvia(intervalloControlloMs = 30_000) {
    if (timer) return;
    timer = setInterval(() => { unTick().catch(() => {}); }, intervalloControlloMs);
    if (timer.unref) timer.unref(); // ⛔ non deve tenere il processo vivo da solo — stesso principio di ogni altro timer di servizio in questo progetto
  }
  function ferma() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return Object.freeze({ unTick, avvia, ferma, eseguiOra, fermaGiro });
}
