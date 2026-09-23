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
    const oggi = ora.toISOString().slice(0, 10);
    for (const voce of automazioni) {
      if (!voce.attiva) continue;
      if (!voce.prossimaEsecuzione) continue;
      if (ora < new Date(voce.prossimaEsecuzione)) continue;
      const eseguiteOggi = voce.giornoContatore === oggi ? voce.eseguiteOggi : 0;
      if (eseguiteOggi >= voce.limiteAlGiorno) continue; // limite raggiunto: si tace fino a domani, non si ritenta ogni giro

      const esito = sessionRegistry.avvia(voce.taskId);
      await store.registraEsecuzione(voce.id);
      onEsecuzione({ automazione: voce, esito });
    }
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
