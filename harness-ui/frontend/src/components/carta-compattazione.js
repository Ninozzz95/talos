/*
 * FE-053 (owner 01/11/2026, scheda `SCHEDA-CONSEGNA-FE-053-2026-11-01.md`, bozzetto `bozzetto-compattazione`): chi scrive le compattazioni e chi lo sostituisce, in
 * Impostazioni → Memoria e contesto, sotto «Motore del contesto». Fino a oggi lo sapeva solo il server (riga 0a della tabella di marcia).
 *
 * Decisioni: la frase della catena sempre a vista, anche con Avanzate chiuso; una scelta sola per tutta l'app. La frase dice solo ciò che la persona può usare: i limiti con
 * un'ora e gli inutilizzabili, mai un fermo passeggero senza ora. Una riserva inutilizzabile esce dalla frase e la dice l'avviso.
 * Lo stato a schermo lo scrive solo la risposta del server, come `motore-contesto.js`: un salvataggio fallito rimette la scelta di prima e lo dice.
 *
 * Forma come `motore-contesto.js` e `aggiornamenti.js`. I `select` li veste `calm-controls.js`. Nomi a schermo: catalogo; se il modello non c'è più, quello della chat
 * (`nomeModelloUmano`).
 */
import { t, linguaCorrenteDiT } from './lingua.js';
import { nomeModelloUmano } from './chat-foot.js';
import { leggiCataloghiDiretti, nomeFornitore, PROVIDER_DIRETTI } from './fonti-modelli.js';
import { chiaveDelMotivo, chiaveDelPerche, EVENTO_SCEGLI_MODELLO_COMPATTAZIONE, oraDelLimite, quandoTorna } from './motivi-compattazione.js';

const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/context-settings';
const conOra = (a) => a?.stato === 'bloccato' && quandoTorna(a.finoAlle) !== null;
const inutilizzabile = (a) => a?.stato === 'inutilizzabile';

const oraDi = (finoAlle) => oraDelLimite(finoAlle, linguaCorrenteDiT());

/** Il nome di un anello: `null` è il modello della conversazione. */
const nomeDi = (anello, nomi, traduci) => (anello.modello ? nomi(anello.modello) : traduci('varie.compaction.card.conversationModel'));

/**
 * Che cosa dice la carta, senza il DOM. `catena`: `GET /api/v1/context-settings`. Torna `{ frase, avviso }`: `frase` nulla quando lo scelto non si può usare (lo dice
 * l'avviso), `avviso` `{ testo, scelta: 'modello' | 'riserva' }`.
 */
export function letturaDellaCatena(catena, { nomi = nomeModelloUmano, traduci = t, ora = oraDi } = {}) {
  const anelli = Array.isArray(catena) ? catena : [];
  const scelto = anelli.find((a) => a.ruolo === 'scelto') ?? null;
  const riserva = anelli.find((a) => a.ruolo === 'riserva') ?? null;
  const coda = traduci('varie.compaction.card.tail');
  const perche = (a) => traduci(chiaveDelPerche(a), { modello: nomeDi(a, nomi, traduci), ora: quandoTorna(a.finoAlle) === null ? '' : ora(a.finoAlle) });
  const avvisoDi = (a, scelta) => ({ testo: perche(a), scelta });
  if (!scelto) return { frase: null, avviso: null };
  if (inutilizzabile(scelto)) return { frase: null, avviso: avvisoDi(scelto, 'modello') };
  const fermo = (a) => traduci('varie.compaction.card.waitingUntil', { modello: nomeDi(a, nomi, traduci), ora: ora(a.finoAlle), parola: traduci(`varie.compaction.reason.${chiaveDelMotivo(a)}`) });
  const primo = conOra(scelto) ? fermo(scelto) : nomeDi(scelto, nomi, traduci);
  const usabile = riserva && !inutilizzabile(riserva);
  const avviso = inutilizzabile(riserva) ? avvisoDi(riserva, 'riserva') : null;
  if (!usabile) return { frase: traduci('varie.compaction.card.chainNoBackup', { primo, coda }), avviso };
  /* «stesso limite» solo se è davvero lo stesso: il limite dell'account del primo. Un altro fornitore dice la sua ora */
  const stesso = conOra(riserva) && riserva.diAccount === true && scelto.diAccount === true && riserva.finoAlle === scelto.finoAlle;
  const secondo = stesso ? traduci('varie.compaction.card.sameLimit', { modello: nomeDi(riserva, nomi, traduci) }) : conOra(riserva) ? fermo(riserva) : nomeDi(riserva, nomi, traduci);
  return { frase: traduci('varie.compaction.card.chain', { primo, secondo, coda }), avviso };
}

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'memoria-compattazione';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-memoria-compattazione');
  const riga = (id) => `<div class="talos-setting" data-c="SettingRow" data-setting-row="${id}"><div class="settings-field-info"><label class="talos-setting__label" for="setting-${id}" data-etichetta></label><p class="talos-setting__help" data-aiuto></p></div><div class="settings-field-control"><select id="setting-${id}" class="talos-select"></select></div></div>`;
  scheda.innerHTML = '<div class="settings-group__head" data-settings-group-head>'
    + '<h3 class="settings-group__title" id="settings-group-memoria-compattazione" data-settings-group-title="memoria-compattazione"></h3></div>'
    + '<p data-compattazione-descrizione></p>'
    + '<p class="talos-setting__help" data-compattazione-catena role="status"></p>'
    + '<div class="talos-setting" data-compattazione-avviso hidden><p class="talos-setting__help" data-compattazione-avviso-testo></p><button type="button" class="talos-button talos-button--secondary talos-button--sm" data-compattazione-scegli></button></div>'
    + '<p class="talos-setting__help" data-compattazione-errore role="alert" hidden></p>'
    + '<button type="button" class="talos-button talos-button--ghost talos-button--sm" aria-expanded="false" data-compattazione-avanzate><svg class="i i--sm" aria-hidden="true"><use href="#i-chevron"></use></svg><span></span></button>'
    + `<div data-compattazione-corpo hidden>${riga('modelloDelRiassunto')}${riga('riservaDelRiassunto')}</div>`;
  return scheda;
}

export function montaCartaCompattazione({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis), win = globalThis } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  let stato = null; let errore = false; let scheda = null; let salvando = false; let modelli = []; let aperta = false;
  /*
   * Revisione del Blocco 22, F6: lo stato a schermo lo scrive l'ultima domanda, non l'ultima risposta. Una GET partita prima del POST, o durante, e tornata dopo rimetteva la
   * scelta vecchia, e la carta mentiva fino alla lettura dopo. Il numero sale a ogni lettura e alla fine di un salvataggio, e chi torna con un numero vecchio si scarta (una
   * lettura che torna mentre il POST è in volo scrive lo stato di prima, che il menu mostra comunque finché il server non risponde: per questo basta la fine). È la
   * forma del `cancelled` di Hermes (`apps/desktop/src/app/settings/config-settings.tsx:194`, clone del 22/10), senza React. I modelli hanno un numero loro: un salvataggio non
   * deve buttare l'elenco in arrivo, o il menu resta vuoto.
   */
  let numeroStato = 0; let numeroModelli = 0;

  async function chiama(metodo, corpo) {
    const risposta = await fetchFn(URL_IMPOSTAZIONI, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || !dati?.data) throw Object.assign(new Error('context-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return dati.data;
  }
  const leggiJson = async (url) => { const r = await fetchFn(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const d = await r.json().catch(() => null); return r.ok ? d?.data ?? null : null; };

  /*
   * Lo stesso elenco del selettore: i fornitori diretti (`leggiCataloghiDiretti`, una lettura sola per i due), `/api/v1/models`, i locali installati. Un catalogo che non risponde
   * toglie le sue voci, non la carta. I modelli pagati dalle chiavi e dal piano vengono prima dei 400 del catalogo. Il selettore li tiene in schede; in un menu piatto lo stesso
   * modello può stare due volte, quindi la voce dice il fornitore, come la pillola dei diretti (L3-10, `app.js`). La frase della catena dice il solo nome.
   */
  async function leggiModelli() {
    const mia = ++numeroModelli;
    const [cloud, diretti, locali] = await Promise.allSettled([leggiJson('/api/v1/models'), leggiCataloghiDiretti(leggiJson), leggiJson('/api/v1/local-models')]);
    if (mia !== numeroModelli) return;
    const voci = new Map();
    const metti = (id, nome, fonte = null) => { if (typeof id === 'string' && id && !voci.has(id)) voci.set(id, { nome: typeof nome === 'string' && nome ? nome : nomeModelloUmano(id), fonte }); };
    const perFornitore = diretti.value?.perFornitore ?? {};
    for (const fonte of ['chatgpt', ...PROVIDER_DIRETTI.map((p) => p.id).filter((id) => id !== 'chatgpt')]) for (const m of (perFornitore[fonte] ?? [])) metti(m?.id, m?.nome, fonte);
    for (const m of (cloud.value?.modelli ?? [])) metti(m?.id, m?.nome);
    for (const m of (locali.value?.items ?? [])) metti(m?.id ? `local:${m.id}` : null, m?.name);
    modelli = [...voci.entries()].map(([id, voce]) => ({ id, ...voce }));
  }
  const nomi = (id) => modelli.find((m) => m.id === id)?.nome ?? nomeModelloUmano(id);
  const voceDelMenu = (m) => { const fornitore = m.fonte ? nomeFornitore(m.fonte) : null; return fornitore ? `${fornitore} · ${m.nome}` : m.nome; };

  function riempi(select, prime, valore) {
    const voci = [...prime, ...modelli.map((m) => ({ valore: m.id, testo: voceDelMenu(m) }))];
    if (valore && !voci.some((v) => v.valore === valore)) voci.push({ valore, testo: nomi(valore) }); // un modello che non c'è più resta la scelta salvata, finché non si cambia
    const firma = JSON.stringify(voci);
    if (select.dataset.firma !== firma) { select.replaceChildren(...voci.map((v) => { const o = documento.createElement('option'); o.value = v.valore; o.textContent = v.testo; return o; })); select.dataset.firma = firma; }
    select.value = valore;
  }

  /*
   * Revisione del Blocco 22, F8: il controllo di `calm-controls.js:232` alterna, quindi un doppio clic su «Scegli un altro» lo apriva e lo richiudeva: col menu già aperto non si
   * clicca. Apertura dichiarata e non alternata, come il `Dialog open` del selettore di Hermes (`apps/desktop/src/components/model-picker.tsx:180`).
   * Sospetto da tastiera (REV22-R4), confermato leggendo: `.click()` non dà il fuoco, e i tasti sono legati al controllo (`calm-controls.js:233`, e `open` non lo sposta). Con
   * Invio su «Scegli un altro» le frecce restavano sul tasto e un altro Invio richiudeva. Il fuoco va sul controllo, dove il combobox lo tiene anche a menu aperto (WAI-ARIA
   * APG, «Select-Only Combobox», letto il 01/11/2026).
   */
  function apriSelect(select) {
    win.requestAnimationFrame?.(() => {
      const controllo = select.closest('.settings-field-control')?.querySelector('.calm-select') ?? select;
      controllo.focus({ preventScroll: true });
      if (controllo.getAttribute('aria-expanded') !== 'true') controllo.click();
    });
  }

  function disegna() {
    const pannello = documento.getElementById('setting-panel-memoria');
    if (!pannello || stato === null) { scheda?.remove(); return; }
    if (!scheda) {
      scheda = creaScheda(documento);
      scheda.querySelector('[data-compattazione-avanzate]').addEventListener('click', () => {
        aperta = !aperta; disegna();
        if (aperta && !modelli.length) void leggiModelli().catch(() => {}).then(disegna);
      });
      scheda.querySelector('#setting-modelloDelRiassunto').addEventListener('change', (e) => { void salva({ modelloDelRiassunto: e.target.value || null }); });
      scheda.querySelector('#setting-riservaDelRiassunto').addEventListener('change', (e) => { void salva({ riservaDelRiassunto: e.target.value || null }); });
    }
    const motore = pannello.querySelector('[data-settings-card="memoria-motore-contesto"]') ?? pannello.querySelector('[data-settings-card="memoria-context"]');
    if (motore && motore.nextElementSibling !== scheda) motore.after(scheda); else if (!scheda.isConnected) pannello.prepend(scheda);
    const q = (s) => scheda.querySelector(s);
    q('.settings-group__title').textContent = t('varie.compaction.card.title');
    q('[data-compattazione-descrizione]').textContent = t('varie.compaction.card.description');
    /* Revisione del Blocco 22, F7: una lettura fallita toglieva la carta in silenzio, e dal salto «Scegli un altro» si arrivava in una pagina muta. Lo dice con la frase della sorella
       (`motore-contesto.js:62`), e niente Avanzate su uno stato che non si sa. La lettura dopo la rimette a posto. */
    const letta = stato !== 'non-disponibile';
    const { frase, avviso } = letta ? letturaDellaCatena(stato.catena, { nomi }) : { frase: t('varie.contextEngine.card.unavailable'), avviso: null };
    const catena = q('[data-compattazione-catena]'); catena.textContent = frase ?? ''; catena.hidden = !frase; catena.style.maxWidth = 'none';
    const rigaAvviso = q('[data-compattazione-avviso]'); rigaAvviso.hidden = !avviso;
    const testoAvviso = q('[data-compattazione-avviso-testo]'); testoAvviso.textContent = avviso?.testo ?? ''; testoAvviso.style.color = 'var(--talos-warning)'; testoAvviso.style.maxWidth = 'none';
    const scegli = q('[data-compattazione-scegli]'); scegli.textContent = t('varie.compaction.card.chooseAnother');
    scegli.onclick = avviso ? () => { aperta = true; disegna(); apriSelect(q(avviso.scelta === 'riserva' ? '#setting-riservaDelRiassunto' : '#setting-modelloDelRiassunto')); } : null;
    const notaErrore = q('[data-compattazione-errore]'); notaErrore.hidden = !errore; notaErrore.textContent = errore ? t('varie.contextEngine.card.notSaved') : '';
    const avanzate = q('[data-compattazione-avanzate]'); avanzate.hidden = !letta; avanzate.setAttribute('aria-expanded', String(aperta)); avanzate.querySelector('span').textContent = t('varie.compaction.card.advanced');
    avanzate.style.cssText = 'justify-self:start;gap:6px'; avanzate.querySelector('svg').style.transform = aperta ? 'rotate(180deg)' : '';
    q('[data-compattazione-corpo]').hidden = !aperta || !letta;
    if (!letta) return;
    const rigaM = q('[data-setting-row="modelloDelRiassunto"]'), rigaR = q('[data-setting-row="riservaDelRiassunto"]');
    rigaM.querySelector('[data-etichetta]').textContent = t('varie.compaction.card.modelLabel');
    rigaM.querySelector('[data-aiuto]').textContent = `${t('varie.compaction.card.modelHelp')} ${t('varie.compaction.card.modelCost')}`;
    rigaR.querySelector('[data-etichetta]').textContent = t('varie.compaction.card.backupLabel');
    rigaR.querySelector('[data-aiuto]').textContent = t('varie.compaction.card.backupHelp');
    const selM = q('#setting-modelloDelRiassunto'), selR = q('#setting-riservaDelRiassunto');
    riempi(selM, [{ valore: '', testo: t('varie.compaction.card.sameAsConversation') }], stato.modelloDelRiassunto ?? '');
    riempi(selR, [{ valore: '', testo: t('varie.compaction.card.noBackup') }, { valore: 'conversazione', testo: t('varie.compaction.card.conversationModelOption') }], stato.riservaDelRiassunto ?? '');
    selM.disabled = salvando; selR.disabled = salvando;
  }

  /*
   * Treno 02/11/2026 (terza corsa, FACCETTE-07, PAGINA-10, SCHEDA-08, visual-matrix): i cataloghi si leggono quando la carta serve, non a ogni avvio. La lettura al montaggio
   * chiedeva a ogni finestra aperta l'elenco di ogni fornitore collegato, e sui due senza chiave (`lmstudio` spento, `esterno` non configurato) lasciava due errori in console
   * anche a chi non apriva mai le Impostazioni. All'avvio basta lo stato; i cataloghi partono dalla scheda «Memoria», dal salto dalla chat o da Avanzate (ci si arriva anche
   * senza il clic sulla scheda, se la sezione si apre da codice).
   */
  async function leggi({ conModelli = true } = {}) {
    const mia = ++numeroStato;
    let letto;
    try { letto = await chiama('GET'); } catch { letto = 'non-disponibile'; }
    if (mia !== numeroStato) return;
    stato = letto; errore = false; disegna();
    if (conModelli && stato !== 'non-disponibile') { await leggiModelli().catch(() => {}); disegna(); }
  }

  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="memoria"]')) void leggi(); };

  async function salva(modifica) {
    if (stato === null || stato === 'non-disponibile') return;
    salvando = true; disegna();
    try { stato = await chiama('POST', modifica); errore = false; } catch { errore = true; } // lo stato resta quello di prima: il menu torna com'era al ridisegno
    finally { numeroStato += 1; salvando = false; disegna(); }
  }

  /* La riga «Scegli un altro» in chat porta qui, con Avanzate aperto: chi apre le Impostazioni è `app.js`, la scelta da aprire la sa la riga */
  const suScegli = (evento) => {
    aperta = true;
    /* `disegna`: una lettura superata da un'altra torna senza disegnare, e un menu dentro Avanzate chiuso non si apre */
    void leggi().then(() => { if (scheda && stato !== 'non-disponibile') { disegna(); scheda.scrollIntoView?.({ block: 'center' }); apriSelect(scheda.querySelector(evento.detail?.scelta === 'riserva' ? '#setting-riservaDelRiassunto' : '#setting-modelloDelRiassunto')); } });
  };
  documento.addEventListener('click', suClic);
  documento.addEventListener(EVENTO_SCEGLI_MODELLO_COMPATTAZIONE, suScegli);
  documento.documentElement.addEventListener(EVENTO_LINGUA, disegna);
  void leggi({ conModelli: false });
  return { leggi, disegna, distruggi() { documento.removeEventListener('click', suClic); documento.removeEventListener(EVENTO_SCEGLI_MODELLO_COMPATTAZIONE, suScegli); documento.documentElement.removeEventListener(EVENTO_LINGUA, disegna); } };
}
