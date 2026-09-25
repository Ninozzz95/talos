import { giornoLocale } from './automation-store.mjs';
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
 * ⭐ 29/8 — copia PORTATA verbatim dal canonico (ledger §14). Zero import
 * — zero adattamento richiesto.
 */
export function createAutomationScheduler({
  store, sessionRegistry, clock = () => new Date(), onEsecuzione = () => {},
}) {
  /**
   * Un giro su TUTTE le automazioni: quelle attive, con `prossimaEsecuzione`
   * già passata, e sotto il loro `limiteAlGiorno`, fanno partire una
   * sessione vera — esattamente come "Esegui ora", solo senza il click.
   *
   * ⛔ Il limite raggiunto NON fa ritentare a ogni giro (sarebbe spam):
   * l'automazione resta ferma fino a domani, quando `registraEsecuzione`
   * (chiamata dal PROSSIMO avvio riuscito) azzera il contatore da sola.
   */
  async function unTick() {
    const automazioni = await store.elenca();
    const ora = clock();
    // GIORNO-LOCALE-01 (owner 25/09/2026, «giorno locale»): lo stesso «oggi» dell'archivio.
    const oggi = giornoLocale(ora);
    for (const voce of automazioni) {
      if (!voce.attiva) continue;
      if (!voce.prossimaEsecuzione) continue;
      if (ora < new Date(voce.prossimaEsecuzione)) continue;
      const eseguiteOggi = voce.giornoContatore === oggi ? voce.eseguiteOggi : 0;
      if (eseguiteOggi >= voce.limiteAlGiorno) continue; // limite raggiunto: si tace fino a domani, non si ritenta ogni giro

      if (typeof voce.consegna === 'string') {
        await eseguiRichiesta(voce);
        continue;
      }
      const esito = sessionRegistry.avvia(voce.taskId);
      await store.registraEsecuzione(voce.id);
      onEsecuzione({ automazione: voce, esito });
    }
  }

  /*
   * ⭐⭐⭐ 24/09/2026 (AUT-2, owner «Richiesta scritta») — un'automazione scritta parte ESATTAMENTE come una sessione
   * vera del Codice (`POST /api/v1/sessions/custom` → `avviaLibero`): nella cartella di progetto, col suo modello,
   * permesso «Workspace write» (il predefinito del composer), client mobile.
   *  - Non riesce a partire (modello non valido, cartella sparita…) ⇒ pausa col motivo, e il turno non si conta.
   *  - Parte ⇒ si conta e si ricorda QUALE sessione (una sessione del pianificatore non ha una riga nell'app: senza
   *    l'id il risultato non si aprirebbe), poi si segue il giro: `RunError` ⇒ pausa col motivo (Temporal, «pause on
   *    failure»: un fallimento non si ripete, e non si paga, a ogni turno); un evento terminale ⇒ si smette di ascoltare.
   */
  async function eseguiRichiesta(voce) {
    let esito;
    try {
      esito = await sessionRegistry.avviaLibero({
        cartellaId: voce.cartellaId, consegna: voce.consegna, modello: voce.modello ?? null,
        mobile: true, permessi: 'Workspace write',
        // AUTO-LIVELLO (25/09/2026, owner «Salvato alla creazione»): il livello salvato; assente = il predefinito del catalogo (RAG-COD).
        ...(voce.reasoning ? { reasoning: voce.reasoning } : {}),
      });
    } catch (errore) {
      esito = { erroreAvvio: errore instanceof Error ? errore.message : String(errore) };
    }
    if (!esito || typeof esito.sessionId !== 'string') {
      await store.sospendiPerErrore(voce.id, esito?.erroreAvvio || 'Avvio non riuscito');
      onEsecuzione({ automazione: voce, esito });
      return;
    }
    await store.registraEsecuzione(voce.id, { sessionId: esito.sessionId });
    seguiGiro(voce.id, esito.sessionId);
    onEsecuzione({ automazione: voce, esito });
  }

  function seguiGiro(idAutomazione, sessionId) {
    if (typeof sessionRegistry.iscriviti !== 'function') return;
    let concluso = false;
    let smetti = null;
    smetti = sessionRegistry.iscriviti(sessionId, (evento) => {
      if (concluso || !evento) return;
      if (evento.type === 'RunError') {
        concluso = true;
        store.sospendiPerErrore(idAutomazione, evento.message || 'Il giro è finito con un errore').catch(() => {});
      } else if (evento.type === 'RunFinished') {
        concluso = true;
      }
      if (concluso && smetti) smetti();
    });
    // `iscriviti` rimanda subito gli eventi già avvenuti: se il giro era già finito, si smette qui.
    if (concluso && smetti) smetti();
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

  return Object.freeze({ unTick, avvia, ferma });
}
