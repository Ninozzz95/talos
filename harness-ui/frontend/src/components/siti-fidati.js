/*
 * «LINK DALLA CHAT» nelle Impostazioni → Sicurezza e privacy (11/10/2026, decisione owner «Clic + conferma del sito»).
 *
 * I siti che la persona ha scelto di aprire senza conferma si devono poter VEDERE e TOGLIERE (regola CRUD: ciò che il prodotto
 * ricorda per conto della persona, la persona lo governa). Si aggiungono solo dalla domanda sul link, nel momento in cui si vede
 * dove porta: qui non c'è un campo «aggiungi sito», perché fidarsi di un nome scritto a mano è proprio l'errore che la domanda evita.
 * ⛔ La forma è quella delle carte sorelle nate dopo il montaggio delle Impostazioni (`aggiornamenti.js`, `motore-contesto.js`):
 *   `talos-card talos-settings__section`, righe `talos-setting`. Nessuna veste nuova.
 * ⛔ Togliere un sito è reversibile (alla prossima apertura si richiede): niente conferma, come vuole la scala dell'attrito
 *   (`modale-td.js`, `confermaModale`).
 *
 * ⭐ 12/10/2026, «due porte» (owner): anche DOVE si aprono i link si vede e si cambia qui —
 *   - in cima, per i siti che non sono nell'elenco: «Chiedi ogni volta», «In TALOS», «Nel tuo browser» (è ciò che scrive la spunta
 *     «Non chiedermi più dove» della domanda, e l'unico posto da cui la si toglie);
 *   - su ogni sito fidato: «In TALOS» o «Nel tuo browser».
 *   Le scelte sono pulsanti del prodotto in fila, con `aria-pressed`: niente controlli nativi (regola owner 13/09).
 */
import { t } from './lingua.js';
import { sitiFidatiDellApp, destinazioneDeiLinkDellApp } from './link-esterni.js';

/** Una fila di scelte a esclusione: quella attiva è il pulsante primario. `voci`: `[{ valore, testo }]`. */
function filaDiScelte(documento, { nome, voci, attuale, scegli }) {
  const fila = documento.createElement('div');
  fila.className = 'talos-siti-fidati__dove';
  fila.setAttribute('role', 'group');
  fila.setAttribute('aria-label', nome);
  for (const voce of voci) {
    const scelta = documento.createElement('button');
    const attiva = voce.valore === attuale;
    scelta.type = 'button';
    scelta.className = `talos-button talos-button--${attiva ? 'primary' : 'secondary'} talos-button--sm`;
    scelta.dataset.c = 'Button';
    scelta.dataset.linkDove = String(voce.valore);
    scelta.setAttribute('aria-pressed', String(attiva));
    scelta.textContent = voce.testo;
    scelta.addEventListener('click', () => { if (!attiva) scegli(voce.valore); });
    fila.append(scelta);
  }
  return fila;
}

export function montaSitiFidati({ documento = globalThis.document, fidati = sitiFidatiDellApp(), destinazioni = destinazioneDeiLinkDellApp() } = {}) {
  if (!documento) return null;
  let scheda = null;
  function disegna() {
    const pannello = documento.getElementById('setting-panel-privacy');
    if (!pannello) return;
    if (!scheda || !scheda.isConnected) {
      scheda = documento.createElement('div');
      scheda.className = 'talos-card talos-settings__section talos-siti-fidati';
      scheda.dataset.c = 'SettingsSection';
      scheda.dataset.settingsCard = 'privacy-link';
      scheda.setAttribute('role', 'group');
      scheda.setAttribute('aria-labelledby', 'settings-group-privacy-link');
      pannello.append(scheda);
    }
    /* il fuoco non si perde ridisegnando: si ritrova la stessa scelta per riga e valore */
    const aFuoco = documento.activeElement instanceof documento.defaultView.Element ? documento.activeElement.closest('[data-link-dove]') : null;
    const riprendi = aFuoco && scheda.contains(aFuoco)
      ? { riga: { ...aFuoco.closest('[data-setting-row], [data-sito-fidato]')?.dataset }, valore: aFuoco.dataset.linkDove } : null;

    const testa = documento.createElement('div');
    testa.className = 'settings-group__head'; testa.dataset.settingsGroupHead = '';
    const titolo = documento.createElement('h3');
    titolo.className = 'settings-group__title'; titolo.id = 'settings-group-privacy-link'; titolo.textContent = t('chat.link.settingsTitle');
    testa.append(titolo);
    const descrizione = documento.createElement('p');
    descrizione.textContent = t('chat.link.settingsDescription');

    const pezzi = [testa, descrizione];
    if (destinazioni) {
      const riga = documento.createElement('div');
      riga.className = 'talos-setting'; riga.dataset.c = 'SettingRow'; riga.dataset.settingRow = 'linkDove';
      const nome = documento.createElement('span');
      nome.className = 'talos-setting__label'; nome.textContent = t('chat.link.settingsWhere');
      const aiuto = documento.createElement('p');
      aiuto.className = 'talos-setting__help'; aiuto.textContent = t('chat.link.settingsWhereHelp');
      const sinistra = documento.createElement('div'); sinistra.append(nome, aiuto);
      const controllo = documento.createElement('div'); controllo.className = 'talos-setting__control';
      controllo.append(filaDiScelte(documento, {
        nome: t('chat.link.settingsWhere'),
        voci: [{ valore: 'chiedi', testo: t('chat.link.whereAsk') }, { valore: 'talos', testo: t('chat.link.whereTalos') }, { valore: 'sistema', testo: t('chat.link.whereSystem') }],
        attuale: destinazioni.fissa() ?? 'chiedi',
        scegli: (valore) => destinazioni.fissaSu(valore === 'chiedi' ? null : valore),
      }));
      riga.append(sinistra, controllo);
      pezzi.push(riga);
    }
    const righe = fidati.elenco().map((sito) => {
      const riga = documento.createElement('div');
      riga.className = 'talos-setting'; riga.dataset.c = 'SettingRow'; riga.dataset.sitoFidato = sito;
      const nome = documento.createElement('span');
      nome.className = 'talos-setting__label'; nome.textContent = sito;
      const sinistra = documento.createElement('div'); sinistra.append(nome);
      const togli = documento.createElement('button');
      togli.type = 'button'; togli.className = 'talos-button talos-button--secondary talos-button--sm';
      togli.textContent = t('chat.link.settingsRemove'); togli.dataset.sitoTogli = '';
      togli.setAttribute('aria-label', t('chat.link.settingsRemoveNamed', { site: sito }));
      togli.addEventListener('click', () => fidati.togli(sito));
      const controllo = documento.createElement('div'); controllo.className = 'talos-setting__control talos-siti-fidati__dove';
      if (destinazioni && typeof fidati.destinazione === 'function') {
        controllo.append(filaDiScelte(documento, {
          nome: t('chat.link.settingsSiteWhere', { site: sito }),
          voci: [{ valore: 'talos', testo: t('chat.link.whereTalos') }, { valore: 'sistema', testo: t('chat.link.whereSystem') }],
          attuale: fidati.destinazione(sito),
          scegli: (valore) => fidati.imposta(sito, valore),
        }));
      }
      controllo.append(togli);
      riga.append(sinistra, controllo);
      return riga;
    });
    const vuoto = documento.createElement('p');
    vuoto.className = 'talos-muted'; vuoto.dataset.sitiFidatiVuoto = ''; vuoto.textContent = t('chat.link.settingsEmpty');
    scheda.replaceChildren(...pezzi, ...(righe.length ? righe : [vuoto]));
    if (riprendi) {
      const stessa = [...scheda.querySelectorAll('[data-setting-row], [data-sito-fidato]')]
        .find((r) => r.dataset.settingRow === riprendi.riga.settingRow && r.dataset.sitoFidato === riprendi.riga.sitoFidato);
      stessa?.querySelector(`[data-link-dove="${riprendi.valore}"]`)?.focus?.({ preventScroll: true });
    }
  }
  fidati.ascolta(disegna);
  destinazioni?.ascolta(disegna);
  /* Il pannello si ridisegna anche quando lo si apre: la lingua può essere cambiata, e la carta nasce solo se il pannello c'è. */
  documento.addEventListener('click', (e) => { if (e.target instanceof documento.defaultView.Element && e.target.closest('[aria-controls="setting-panel-privacy"]')) disegna(); });
  disegna();
  return { disegna };
}
