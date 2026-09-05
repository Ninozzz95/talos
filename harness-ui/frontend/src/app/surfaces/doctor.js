import { createButton, createCheckCard } from '../../design-system/index.js';

/*
 * Il Doctor: nona superficie dell'estrazione.
 *
 * Legge la diagnosi vera di `src/doctor.mjs` (`GET /api/v1/doctor`), che è un
 * oggetto eterogeneo: alcuni controlli ci sono sempre (`chiaveApi`, `shell`,
 * `git`, `naviga`), altri compaiono solo quando il server ha qualcosa da dire
 * (`labs`, `ricercaWeb`, `cartelleProgetto`, `providers`, `ownerRuntime`,
 * `catalogoTask`, `sessioniPersistenza`).
 *
 * ⛔⛔ LA REGOLA DI QUESTA SUPERFICIE, e vale la pena scriverla per esteso
 * perché la ricerca del 05/09/2026 NON l'ha trovata documentata da nessuna
 * parte — le dashboard di salute descrivono tre stati (passa · fallisce · non
 * applicabile) ma nessuna dice cosa fare di un controllo che non è stato
 * eseguito: **un controllo assente non è verde.** È la stessa regola che
 * governa Board e barra di stato — «misurato» e «non misurato» non si scrivono
 * uguali — applicata alla diagnostica, dove sbagliarla è peggio: una spunta
 * verde su qualcosa che nessuno ha guardato è esattamente la bugia che un
 * Doctor esiste per non dire. Un controllo assente diventa una NOTA che dice
 * «non verificato», mai un «ok».
 * Contesto della ricerca: codewithmukesh.com/blog/health-checks-in-aspnet-core/
 * · milanjovanovic.tech/blog/health-checks-in-asp-net-core (stati oltre il
 * binario: «degraded» esiste perché due stati non bastano).
 *
 * ⛔ E un guasto senza rimedio dichiarato NON si declassa a nota per far
 * contento il componente: resta un guasto, e il rimedio diventa «questo
 * problema non ha ancora un rimedio scritto, segnalalo». Abbassare la
 * severità per evitare un errore di montaggio nasconderebbe il guasto.
 */
const SEVERITA_VALIDE = new Set(['ok', 'info', 'warning', 'danger']);

/** I quattro controlli che il server manda sempre, con il loro tipo. */
const CONTROLLI_BOOLEANI = ['chiaveApi', 'git', 'naviga'];

export function createDoctorSurface({ documentObj, labels, testId, onRemedy }) {
  if (!documentObj) throw new TypeError('dipendenze doctor mancanti');
  if (!labels || !labels.checks || !labels.notChecked) {
    throw new TypeError('il doctor richiede le sue etichette (checks, notChecked)');
  }

  const radice = documentObj.createElement('section');
  radice.className = 'talos-doctor';
  radice.setAttribute('aria-label', labels.regionLabel || 'Doctor');
  if (testId) radice.dataset.testid = testId;

  const elenco = documentObj.createElement('div');
  elenco.className = 'talos-doctor__list';
  radice.append(elenco);

  let props = { diagnosi: null };
  let carte = [];

  function pulisci() {
    for (const carta of carte) carta.destroy();
    carte = [];
  }

  /**
   * La severità di un controllo, e mai un verde per difetto.
   * @returns {{severity:string, text:string, checked:boolean}}
   */
  function esitoDi(chiave, diagnosi) {
    const etichette = labels.checks[chiave] || {};
    if (!diagnosi || !(chiave in diagnosi)) {
      // ⛔ Assente = NON VERIFICATO. Non è «ok» e non è «rotto».
      return { severity: 'info', text: etichette.notChecked || labels.notChecked, checked: false };
    }
    const valore = diagnosi[chiave];
    if (CONTROLLI_BOOLEANI.includes(chiave)) {
      return valore === true
        ? { severity: 'ok', text: etichette.ok || '', checked: true }
        : { severity: etichette.failSeverity || 'warning', text: etichette.fail || '', checked: true };
    }
    if (chiave === 'shell') {
      // La shell dichiara il suo enforcement: è un fatto, non un giudizio.
      return { severity: 'ok', text: (etichette.ok || '{v}').replace('{v}', String(valore ?? '')), checked: true };
    }
    // Le sezioni ricche portano già il loro `dettaglio` a parole dal server:
    // si MOSTRA, non si riassume — riscriverlo perderebbe il soggetto.
    const dettaglio = valore && typeof valore === 'object' ? valore.dettaglio : null;
    const problema = valore && typeof valore === 'object' && valore.problema === true;
    return {
      severity: problema ? (etichette.failSeverity || 'warning') : 'info',
      text: dettaglio || etichette.ok || '',
      checked: true,
    };
  }

  function disegna() {
    pulisci();
    const diagnosi = props.diagnosi;
    const figli = [];
    for (const chiave of labels.order || Object.keys(labels.checks)) {
      const etichette = labels.checks[chiave] || {};
      const esito = esitoDi(chiave, diagnosi);
      const severita = SEVERITA_VALIDE.has(esito.severity) ? esito.severity : 'info';

      /*
       * ⛔ Un guasto senza rimedio resta un guasto. Il componente esige un
       * rimedio per `warning` e `danger`; se le etichette non ne dichiarano
       * uno, si scrive che manca invece di abbassare la severità.
       */
      const serveRimedio = severita === 'warning' || severita === 'danger';
      /*
       * ⛔ Il rimedio compare SOLO quando c'è qualcosa da rimediare. La prima
       * versione lo montava ogni volta che l'etichetta ne dichiarava uno, e un
       * controllo a posto offriva «Installare Git» — un invito ad aggiustare
       * ciò che funziona, che fa dubitare anche del verde accanto.
       */
      const rimedio = serveRimedio ? (etichette.remedy || labels.missingRemedy) : null;

      let bottone = null;
      if (rimedio) {
        bottone = createButton({
          document: documentObj,
          label: rimedio,
          variant: 'secondary',
          onPress: () => { if (typeof onRemedy === 'function') onRemedy(chiave); },
          testId: `doctor-${chiave}-rimedio`,
        });
        carte.push(bottone);
      }
      const carta = createCheckCard({
        document: documentObj,
        title: etichette.title || chiave,
        severity: severita,
        severityLabel: labels.severities?.[severita] || severita,
        text: esito.text,
        actions: bottone ? [bottone.element] : [],
        testId: `doctor-${chiave}`,
      });
      carte.push(carta);
      // Lo stato resta interrogabile: una prova e un CSS non devono leggere il testo.
      carta.element.dataset.controllo = chiave;
      carta.element.dataset.verificato = esito.checked ? 'si' : 'no';
      figli.push(carta.element);
    }
    elenco.replaceChildren(...figli);
  }

  disegna();

  let distrutta = false;
  return Object.freeze({
    element: radice,
    update(nextProps = {}) {
      props = { ...props, ...nextProps };
      disegna();
    },
    destroy() {
      if (distrutta) return false;
      distrutta = true;
      pulisci();
      radice.remove();
      return true;
    },
  });
}
