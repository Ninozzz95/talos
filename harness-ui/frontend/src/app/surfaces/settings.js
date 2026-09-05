import { createButton, createField, createSelect, createSettingRow, createSwitch } from '../../design-system/index.js';

/*
 * Le Impostazioni: decima superficie dell'estrazione.
 *
 * ⛔⛔ Il vincolo che avrei sbagliato, dalla ricerca del 05/09/2026: **non si
 * mescolano** controlli che si salvano da soli e controlli che richiedono un
 * salvataggio esplicito nella stessa vista — «autosave è rilevante per
 * l'intera vista, non mischiare i due sulla stessa pagina». E la ripartizione
 * non è arbitraria: gli interruttori (controlli IMPERATIVI: l'azione È la
 * scelta) vogliono il salvataggio automatico e un ritorno immediato; i campi
 * di testo (controlli DICHIARATIVI: si scrive un valore e POI lo si invia)
 * vogliono l'esplicito, perché un'informazione sensibile non deve partire per
 * sbaglio — e qui i campi di testo contengono chiavi di fornitore.
 * ⇒ Una sezione dichiara il suo modo, e una sezione «automatica» che contiene
 * un campo di testo è una CONTRADDIZIONE: si rifiuta al montaggio invece di
 * scegliere in silenzio uno dei due. È un errore di chi scrive, non di chi usa.
 * Fonti: primer.style/product/ui-patterns/saving/ ·
 * damianwajer.com/blog/autosave/ ·
 * medium.com/@adamshriki/the-different-types-of-saving-options-and-how-to-choose-the-right-one-22732d424714
 *
 * ⛔ Su Windows ci si aspetta «Salva»: quando una sezione è esplicita, le
 * modifiche non salvate si VEDONO e il pulsante resta raggiungibile.
 *
 * ⛔ Ogni riga dichiara la sua PORTATA («vale da subito», «vale dalle sessioni
 * nuove»): il componente la esige, e un'impostazione che non dice quando morde
 * è una promessa non verificabile.
 */
const MODI_SALVATAGGIO = new Set(['auto', 'explicit']);
const CONTROLLI_DICHIARATIVI = new Set(['text', 'password', 'select']);

export function createSettingsSurface({ documentObj, store, labels, testId, onChange, onSave, onDiscard }) {
  if (!documentObj || !store) throw new TypeError('dipendenze impostazioni mancanti');
  if (!labels || !Array.isArray(labels.sections) || labels.sections.length === 0) {
    throw new TypeError('le impostazioni richiedono le loro etichette (sections)');
  }

  for (const sezione of labels.sections) {
    if (!MODI_SALVATAGGIO.has(sezione.saving)) {
      throw new TypeError(`la sezione «${sezione.id}» deve dichiarare come si salva: 'auto' o 'explicit'`);
    }
    if (sezione.saving !== 'auto') continue;
    const dichiarativo = (sezione.rows || []).find((riga) => CONTROLLI_DICHIARATIVI.has(riga.type));
    if (dichiarativo) {
      // ⛔ Non si sceglie in silenzio: si dice quale riga rompe la regola.
      throw new TypeError(
        `la sezione «${sezione.id}» si salva da sola ma contiene «${dichiarativo.id}», che è un campo da compilare: `
        + 'un valore scritto non deve partire prima che la persona lo invii',
      );
    }
  }

  const radice = documentObj.createElement('section');
  radice.className = 'talos-settings';
  radice.setAttribute('aria-label', labels.regionLabel || 'Impostazioni');
  if (testId) radice.dataset.testid = testId;

  let props = { values: {}, validation: {}, dirty: {} };
  let componenti = [];

  function pulisci() {
    for (const componente of componenti) componente.destroy();
    componenti = [];
  }

  function controlloPer(sezione, riga) {
    const valore = props.values?.[riga.id];
    if (riga.type === 'switch') {
      const interruttore = createSwitch({
        document: documentObj,
        label: riga.label,
        checked: valore === true,
        // ⛔ Un interruttore si salva DA SOLO: l'azione è già la scelta, e un
        // «Salva» accanto a un interruttore chiede due volte la stessa cosa.
        onChange: (acceso) => { if (typeof onChange === 'function') onChange(riga.id, acceso, { saving: sezione.saving }); },
        testId: `settings-${riga.id}`,
      });
      componenti.push(interruttore);
      return interruttore.element;
    }
    if (riga.type === 'select') {
      const scelta = createSelect({
        document: documentObj,
        label: riga.label,
        value: valore ?? riga.options?.[0]?.value,
        options: riga.options || [],
        onChange: (v) => { if (typeof onChange === 'function') onChange(riga.id, v, { saving: sezione.saving }); },
        testId: `settings-${riga.id}`,
      });
      componenti.push(scelta);
      return scelta.element;
    }
    const campo = createField({
      document: documentObj,
      label: riga.label,
      type: riga.type === 'password' ? 'password' : 'text',
      value: valore ?? '',
      placeholder: riga.placeholder,
      error: props.validation?.[riga.id] || null,
      onInput: (v) => { if (typeof onChange === 'function') onChange(riga.id, v, { saving: sezione.saving }); },
      testId: `settings-${riga.id}`,
    });
    componenti.push(campo);
    return campo.element;
  }

  function disegnaSezione(sezione) {
    const blocco = documentObj.createElement('section');
    blocco.className = 'talos-settings__section';
    blocco.dataset.sezione = sezione.id;
    // Il modo di salvataggio resta leggibile: una prova e un CSS non devono dedurlo.
    blocco.dataset.salvataggio = sezione.saving;

    const titolo = documentObj.createElement('h2');
    titolo.className = 'talos-settings__title';
    titolo.textContent = sezione.label;
    blocco.append(titolo);

    for (const riga of sezione.rows || []) {
      const voce = createSettingRow({
        document: documentObj,
        label: riga.label,
        description: riga.description,
        // Il componente la esige, e ha ragione: quando morde è parte della scelta.
        scope: riga.scope || labels.scopes?.[sezione.saving] || '',
        control: controlloPer(sezione, riga),
        testId: `settings-row-${riga.id}`,
      });
      componenti.push(voce);
      blocco.append(voce.element);
    }

    /*
     * ⛔ Solo le sezioni esplicite hanno il piede con «Salva». Metterlo anche
     * sotto una sezione che si salva da sola direbbe a chi guarda che le sue
     * scelte NON sono ancora al sicuro — cioè il contrario del vero.
     */
    if (sezione.saving === 'explicit') {
      const piede = documentObj.createElement('div');
      piede.className = 'talos-settings__footer';

      const sporca = Boolean(props.dirty?.[sezione.id]);
      const avviso = documentObj.createElement('p');
      avviso.className = 'talos-settings__dirty';
      avviso.setAttribute('role', 'status');
      avviso.textContent = sporca ? (labels.unsaved || '') : '';
      piede.append(avviso);

      const salva = createButton({
        document: documentObj,
        label: labels.save || 'Salva',
        variant: 'primary',
        disabled: !sporca,
        onPress: () => { if (typeof onSave === 'function') onSave(sezione.id); },
        testId: `settings-save-${sezione.id}`,
      });
      componenti.push(salva);
      piede.append(salva.element);

      if (sporca && labels.discard) {
        const scarta = createButton({
          document: documentObj,
          label: labels.discard,
          variant: 'secondary',
          onPress: () => { if (typeof onDiscard === 'function') onDiscard(sezione.id); },
          testId: `settings-discard-${sezione.id}`,
        });
        componenti.push(scarta);
        piede.append(scarta.element);
      }
      blocco.append(piede);
    }
    return blocco;
  }

  function disegna() {
    pulisci();
    radice.replaceChildren(...labels.sections.map((sezione) => disegnaSezione(sezione)));
  }

  const unsubscribe = store.subscribe(
    (state) => state.settings,
    (impostazioni) => {
      props = { ...props, values: impostazioni.values, validation: impostazioni.validation };
      disegna();
    },
    { equal: Object.is },
  );

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
      unsubscribe();
      pulisci();
      radice.remove();
      return true;
    },
  });
}
