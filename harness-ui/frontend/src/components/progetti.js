/*
 * I progetti: le cartelle su cui TALOS lavora, e cosa ci è successo dentro.
 *
 * ⛔ 06/9 — trovato dal CANCELLO, non da un paio d'occhi: la voce «Progetti» della sidebar aveva un
 * contatore che diceva 6 e **nessun `data-vaia`**. Il clic non portava da nessuna parte: è lo stesso
 * difetto delle «Note», e la macchina l'ha visto guardando 102 combinazioni. La rotta
 * `/api/v1/projects` esisteva già e rispondeva coi dati veri — mancava solo il posto dove leggerli.
 *
 * ## Cosa fa Hermes, letto nel suo codice (06/09/2026)
 * `apps/desktop/src/app/chat/sidebar/projects/` — e i numeri sono suoi, non stimati:
 * · un progetto raggruppa le sessioni **attraverso più repo e worktree** («Every session in a
 *   project, across its repos/worktrees»), non una cartella sola;
 * · `PROJECT_PREVIEW_COUNT = 3` — sotto ogni progetto si vedono le **tre** sessioni più recenti;
 * · `SIDEBAR_GROUP_PAGE = 5` — si pagina a cinque righe per gruppo invece di srotolare tutto;
 * · l'ordine è per **recency della sessione**, non alfabetico: il progetto su cui hai appena
 *   lavorato sta in cima;
 * · un progetto ha **colore e icona** propri, e le sessioni senza progetto hanno comunque una casa
 *   (`isNoProject`, icona `home`) invece di sparire.
 *
 * ⭐ Il nostro +1: Hermes mostra le sessioni; noi mostriamo anche **cosa è costato** — giri e token
 * per progetto — perché è la domanda che una persona si fa guardando un elenco di progetti, e i
 * dati ce li abbiamo già in `usageSessione`.
 *
 * ⛔ L'ultima riga di ogni progetto NON si inventa: se un progetto non ha sessioni si dice, invece
 * di mostrare uno zero che sembra una misura.
 */
import { usageDellaSessione } from './consumo-sessione.js';

/** Quante sessioni recenti si mostrano sotto ogni progetto — lo stesso numero di Hermes. */
export const QUANTE_RECENTI = 3;

/**
 * L'id del progetto di una sessione. Il legame vive nel `taskId`: `libero:<progetto>`.
 * ⛔ Una sessione di un task del corpus (`corpus:qualcosa`) non appartiene a un progetto: torna
 *    null invece di inventare un'appartenenza.
 */
export function progettoDiSessione(sessione) {
  const task = String(sessione?.taskId || '');
  if (!task.startsWith('libero:')) return null;
  const id = task.slice('libero:'.length).trim();
  return id || null;
}

/** La sessione più recente di un gruppo, come momento confrontabile. */
function quandoUltima(sessioni) {
  let ultima = 0;
  for (const s of sessioni) {
    const t = new Date(s?.avviataAlle).getTime();
    if (Number.isFinite(t) && t > ultima) ultima = t;
  }
  return ultima;
}

/**
 * Unisce progetti e sessioni, e ordina per recency come fa Hermes: quello su cui hai appena
 * lavorato sta in cima, non quello che viene prima in ordine alfabetico.
 * @returns {Array<{id, nome, sessioni, quante, ultimaAlle, giri, token}>}
 */
export function progettiConSessioni(progetti, sessioni) {
  const elenco = Array.isArray(progetti) ? progetti : [];
  const tutte = Array.isArray(sessioni) ? sessioni : [];
  const per = new Map(elenco.map((p) => [String(p.id), []]));
  for (const s of tutte) {
    const id = progettoDiSessione(s);
    if (id && per.has(id)) per.get(id).push(s);
  }
  return elenco
    .map((p) => {
      const sue = per.get(String(p.id)) || [];
      let giri = 0;
      let token = 0;
      for (const s of sue) {
        const u = usageDellaSessione(s);
        if (Number.isFinite(u?.giri)) giri += u.giri;
        const dentro = Number(u?.prompt_tokens) || 0;
        const fuori = Number(u?.completion_tokens) || 0;
        token += dentro + fuori;
      }
      return {
        id: String(p.id), nome: p.nome || String(p.id),
        sessioni: [...sue].sort((a, b) => String(b.avviataAlle).localeCompare(String(a.avviataAlle))),
        quante: sue.length, ultimaAlle: quandoUltima(sue),
        giri, token,
      };
    })
    .sort((a, b) => b.ultimaAlle - a.ultimaAlle || a.nome.localeCompare(b.nome));
}

/** Le prime N sessioni di un progetto, già ordinate dalla più recente. */
export function ultimeSessioni(progetto, quante = QUANTE_RECENTI) {
  return (progetto?.sessioni || []).slice(0, Math.max(0, quante));
}

/** «6 progetti» / «1 progetto» / «nessun progetto» — il plurale italiano, non una `s`. */
export function sommarioProgetti(quanti) {
  const n = Number(quanti) || 0;
  if (n === 0) return 'nessun progetto';
  return n === 1 ? '1 progetto' : `${n} progetti`;
}

/** La riga di fatti sotto il nome: ciò che manca non si scrive, e non diventa uno zero. */
export function frasiProgetto(progetto) {
  if (!progetto) return '';
  if (!progetto.quante) return 'nessuna sessione ancora';
  const pezzi = [progetto.quante === 1 ? '1 sessione' : `${progetto.quante} sessioni`];
  if (progetto.giri > 0) pezzi.push(progetto.giri === 1 ? '1 giro' : `${progetto.giri} giri`);
  if (progetto.token > 0) {
    pezzi.push(progetto.token >= 1000 ? `${(progetto.token / 1000).toFixed(1).replace('.', ',')}k token` : `${progetto.token} token`);
  }
  return pezzi.join(' · ');
}

/**
 * Disegna l'elenco. Nessuna innerHTML: i nomi di progetto e di sessione vengono da fuori.
 * @param {HTMLElement} schermo lo `#schermoProgetti`
 * @param {Array} progetti già passati da `progettiConSessioni`
 * @param {{onApriSessione?:Function, quanteRecenti?:number}} [opzioni]
 * @returns {number} quanti progetti disegnati
 */
export function montaProgetti(schermo, progetti, { onApriSessione = null, quanteRecenti = QUANTE_RECENTI } = {}) {
  if (!schermo) return 0;
  const d = schermo.ownerDocument || globalThis.document;
  const lista = schermo.querySelector('#elencoProgetti');
  const vuoto = schermo.querySelector('#progettiVuoti');
  const stato = schermo.querySelector('[data-progetti-stato]');
  const sommario = schermo.querySelector('[data-progetti-sommario]');
  const elenco = Array.isArray(progetti) ? progetti : [];
  if (stato) stato.textContent = sommario0(elenco);
  if (sommario) sommario.textContent = sommarioProgetti(elenco.length);
  if (!lista) return elenco.length;
  lista.replaceChildren();
  for (const p of elenco) {
    const li = d.createElement('li');
    li.className = 'talos-progetto';
    li.dataset.progetto = p.id;
    const testa = d.createElement('div');
    testa.className = 'talos-progetto__testa';
    testa.append(
      el(d, 'span', 'talos-progetto__nome', p.nome),
      el(d, 'span', 'talos-progetto__fatti', frasiProgetto(p)),
    );
    li.append(testa);
    const recenti = ultimeSessioni(p, quanteRecenti);
    if (recenti.length) {
      const ul = d.createElement('ul');
      ul.className = 'talos-progetto__sessioni';
      for (const s of recenti) {
        const riga = d.createElement('li');
        const bottone = d.createElement('button');
        bottone.type = 'button';
        bottone.className = 'talos-progetto__sessione';
        bottone.dataset.apriSessione = s.sessionId || '';
        bottone.append(
          el(d, 'span', 'talos-progetto__sessione-nome', s.nome || s.taskId || 'Sessione senza nome'),
          el(d, 'span', 'talos-progetto__sessione-quando', oraCorta(s.avviataAlle)),
        );
        if (typeof onApriSessione === 'function') bottone.addEventListener('click', () => onApriSessione(s));
        riga.append(bottone);
        ul.append(riga);
      }
      li.append(ul);
      // ⛔ Hermes ne mostra tre e non dice quante restano: se ce ne sono altre, lo diciamo.
      if (p.quante > recenti.length) {
        li.append(el(d, 'p', 'talos-progetto__altre', `e altre ${p.quante - recenti.length} più vecchie`));
      }
    }
    lista.append(li);
  }
  if (vuoto) vuoto.hidden = elenco.length > 0;
  return elenco.length;
}

function sommario0(elenco) {
  const conSessioni = elenco.filter((p) => p.quante > 0).length;
  if (!elenco.length) return sommarioProgetti(0);
  if (conSessioni === elenco.length) return sommarioProgetti(elenco.length);
  return `${sommarioProgetti(elenco.length)} · ${conSessioni} con sessioni`;
}

function el(d, tag, classe, testo) {
  const nodo = d.createElement(tag);
  if (classe) nodo.className = classe;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

/** L'ora come nella sidebar: oggi l'ora, ieri «ieri», poi la data corta. */
export function oraCorta(iso, adesso = new Date()) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const giorno = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const differenza = Math.round((giorno(adesso) - giorno(data)) / 86_400_000);
  if (differenza <= 0) return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
  if (differenza === 1) return 'ieri';
  if (differenza < 7) return `${differenza} g`;
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
}
