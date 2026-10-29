/*
 * L1 1.3 (owner 26/10/2026, bozzetto approvato «Sì, così») — «QUANDO LA FINESTRA DI UN MODELLO LOCALE SI RIEMPIE», in
 * Impostazioni → Modelli, sotto il Laboratorio modelli.
 *
 * Semplice a primo sguardo, avanzato a richiesta: di serie non serve toccare niente («Allarga la finestra»: se il modello e la memoria
 * lo reggono il motore si riapre più grande e la conversazione continua, altrimenti riassume come sempre); qui chi vuole sceglie
 * «Riassumi» (nessuna memoria in più) o «Chiedimi». Tre carte a scelta singola (`talos-choice-grid`, come la fonte della ricerca),
 * mai un controllo nativo. La scelta sta sul SERVER (`GET/POST /api/v1/local-engine/window-policy`, `finestra-che-cresce.mjs`): vale
 * anche per le conversazioni che nascono senza interfaccia. Lo stato a schermo lo scrive SOLO la risposta del server.
 */
import { t } from './lingua.js';

const EVENTO_LINGUA = 'talos:lingua';
const URL_SCELTA = '/api/v1/local-engine/window-policy';
export const SCELTE = Object.freeze(['allarga', 'riassumi', 'chiedi']);
const CHIAVI = Object.freeze({ allarga: 'enlarge', riassumi: 'summarize', chiedi: 'ask' });

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'modelli-finestra-piena';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-modelli-finestra-piena');
  const testa = documento.createElement('div'); testa.className = 'settings-group__head'; testa.dataset.settingsGroupHead = '';
  const titolo = documento.createElement('h3'); titolo.className = 'settings-group__title'; titolo.id = 'settings-group-modelli-finestra-piena';
  testa.append(titolo);
  const descrizione = documento.createElement('p'); descrizione.dataset.finestraPienaDescrizione = '';
  const griglia = documento.createElement('div');
  griglia.className = 'talos-choice-grid'; griglia.dataset.c = 'ChoiceCards'; griglia.setAttribute('role', 'radiogroup');
  const carte = {};
  for (const scelta of SCELTE) {
    const b = documento.createElement('button');
    b.type = 'button'; b.className = 'talos-choice'; b.setAttribute('role', 'radio'); b.dataset.finestraPiena = scelta;
    const t1 = documento.createElement('span'); t1.className = 'talos-choice__title';
    const t2 = documento.createElement('span'); t2.className = 'talos-muted';
    b.append(t1, t2);
    griglia.append(b);
    carte[scelta] = { b, titolo: t1, nota: t2 };
  }
  const stato = documento.createElement('p'); stato.className = 'talos-setting__help'; stato.setAttribute('role', 'status'); stato.dataset.finestraPienaStato = '';
  scheda.append(testa, descrizione, griglia, stato);
  return { scheda, titolo, descrizione, griglia, carte, stato };
}

export function montaFinestraPiena({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  /* `scelta`: null = non ancora letta; una delle tre = la risposta del server; 'non-disponibile' = la rotta risponde con un errore. */
  let scelta = null; let errore = false; let scheda = null; let salvando = false; let inArrivo = null;

  async function chiama(metodo, corpo) {
    const risposta = await fetchFn(URL_SCELTA, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || !SCELTE.includes(dati?.data?.scelta)) throw Object.assign(new Error('window-policy'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return dati.data.scelta;
  }

  function disegna() {
    const pannello = documento.getElementById('setting-panel-models');
    if (!pannello) return;
    if (!scheda || !scheda.scheda.isConnected) {
      scheda = creaScheda(documento);
      for (const [valore, carta] of Object.entries(scheda.carte)) carta.b.addEventListener('click', () => { void salva(valore); });
      scheda.griglia.addEventListener('keydown', muoviConLeFrecce);
      pannello.append(scheda.scheda);
    }
    scheda.titolo.textContent = t('varie.localWindow.card.title');
    scheda.descrizione.textContent = t('varie.localWindow.card.description');
    scheda.griglia.setAttribute('aria-label', t('varie.localWindow.card.title'));
    const disponibile = SCELTE.includes(scelta);
    /* C-R2 (revisione del blocco 10, 27/10/2026): mentre salva, la carta cliccata è già quella segnata (ottimistica) e la griglia è
       `aria-busy`; niente `disabled` — con la regola globale delle scelte spente la carta scelta lampeggiava grigia. Un secondo clic
       mentre salva non parte (`salva` lo ignora). */
    const mostrata = salvando && SCELTE.includes(inArrivo) ? inArrivo : scelta;
    scheda.griglia.setAttribute('aria-busy', String(Boolean(salvando)));
    for (const [valore, carta] of Object.entries(scheda.carte)) {
      carta.titolo.textContent = t(`varie.localWindow.choice.${CHIAVI[valore]}.title`);
      carta.nota.textContent = t(`varie.localWindow.choice.${CHIAVI[valore]}.help`);
      const scelta_ = disponibile && mostrata === valore;
      carta.b.setAttribute('aria-checked', String(scelta_));
      carta.b.tabIndex = scelta_ || (!disponibile && valore === 'allarga') ? 0 : -1;
      carta.b.disabled = !disponibile;
    }
    scheda.stato.textContent = scelta === 'non-disponibile' ? t('varie.localWindow.card.unavailable') : errore ? t('varie.localWindow.card.notSaved') : '';
    scheda.stato.hidden = scheda.stato.textContent === '';
  }

  /* Il gruppo a scelta singola si percorre con le frecce, come i radio nativi (WAI-ARIA «Radio Group»): la freccia sceglie. */
  function muoviConLeFrecce(evento) {
    const passi = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(evento.key in passi) || !SCELTE.includes(scelta)) return;
    evento.preventDefault();
    const prossima = SCELTE[(SCELTE.indexOf(scelta) + passi[evento.key] + SCELTE.length) % SCELTE.length];
    void salva(prossima).then(() => scheda?.carte[prossima]?.b.focus());
  }

  async function leggi() {
    try { scelta = await chiama('GET'); } catch { scelta = 'non-disponibile'; }
    errore = false; disegna();
  }

  async function salva(valore) {
    if (!SCELTE.includes(scelta) || salvando || valore === scelta) return;
    salvando = true; inArrivo = valore; disegna();
    try { scelta = await chiama('POST', { scelta: valore }); errore = false; }
    catch { errore = true; } // la scelta resta quella di prima: al ridisegno la carta giusta resta segnata
    finally { salvando = false; inArrivo = null; disegna(); }
  }

  /* Si rilegge ogni volta che si apre la scheda «Modelli» (un'altra finestra può averla cambiata), e si ridisegna al cambio di lingua. */
  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="models"]')) void leggi(); };
  documento.addEventListener('click', suClic);
  documento.documentElement.addEventListener(EVENTO_LINGUA, disegna);
  void leggi();
  return { leggi, disegna, salva, distruggi() { documento.removeEventListener('click', suClic); documento.documentElement.removeEventListener(EVENTO_LINGUA, disegna); } };
}
