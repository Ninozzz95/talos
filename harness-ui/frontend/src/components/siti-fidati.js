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
 */
import { t } from './lingua.js';
import { sitiFidatiDellApp } from './link-esterni.js';

export function montaSitiFidati({ documento = globalThis.document, fidati = sitiFidatiDellApp() } = {}) {
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
    const testa = documento.createElement('div');
    testa.className = 'settings-group__head'; testa.dataset.settingsGroupHead = '';
    const titolo = documento.createElement('h3');
    titolo.className = 'settings-group__title'; titolo.id = 'settings-group-privacy-link'; titolo.textContent = t('chat.link.settingsTitle');
    testa.append(titolo);
    const descrizione = documento.createElement('p');
    descrizione.textContent = t('chat.link.settingsDescription');
    const righe = fidati.elenco().map((sito) => {
      const riga = documento.createElement('div');
      riga.className = 'talos-setting'; riga.dataset.c = 'SettingRow'; riga.dataset.sitoFidato = sito;
      const nome = documento.createElement('span');
      nome.className = 'talos-setting__label'; nome.textContent = sito;
      const sinistra = documento.createElement('div'); sinistra.append(nome);
      const togli = documento.createElement('button');
      togli.type = 'button'; togli.className = 'talos-button talos-button--secondary talos-button--sm';
      togli.textContent = t('chat.link.settingsRemove');
      togli.setAttribute('aria-label', t('chat.link.settingsRemoveNamed', { site: sito }));
      togli.addEventListener('click', () => fidati.togli(sito));
      const controllo = documento.createElement('div'); controllo.className = 'talos-setting__control'; controllo.append(togli);
      riga.append(sinistra, controllo);
      return riga;
    });
    const vuoto = documento.createElement('p');
    vuoto.className = 'talos-muted'; vuoto.dataset.sitiFidatiVuoto = ''; vuoto.textContent = t('chat.link.settingsEmpty');
    scheda.replaceChildren(testa, descrizione, ...(righe.length ? righe : [vuoto]));
  }
  fidati.ascolta(disegna);
  /* Il pannello si ridisegna anche quando lo si apre: la lingua può essere cambiata, e la carta nasce solo se il pannello c'è. */
  documento.addEventListener('click', (e) => { if (e.target instanceof documento.defaultView.Element && e.target.closest('[aria-controls="setting-panel-privacy"]')) disegna(); });
  disegna();
  return { disegna };
}
