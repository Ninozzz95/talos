import { t } from './lingua.js';
const KEY = 'talos.session-deletion-feedback.v1';
const empty = () => ({schema: KEY, output: false, workflow: false});
const valid = value => value && !Array.isArray(value) && value.schema === KEY
  && typeof value.output === 'boolean' && typeof value.workflow === 'boolean'
  && Object.keys(value).length === 3;

/** A receipt of a past partial deletion, never an assertion of current server state. */
export function creaAvvisiEliminazione({storage, mostraToast}) {
  let receipt = empty(), revision = 0;
  try {
    const raw = storage().getItem(KEY);
    if (typeof raw === 'string' && raw.length <= 256) {
      const parsed = JSON.parse(raw);
      if (valid(parsed)) receipt = parsed;
    }
  } catch { /* Browser storage can be unavailable; keep current-page feedback usable. */ }
  const pendente = () => receipt.output || receipt.workflow;
  return {
    pendente,
    registra(result) {
      const output = result?.outputCleanup?.state === 'pending';
      const workflow = Array.isArray(result?.workflowNonEliminati) && result.workflowNonEliminati.length > 0;
      if (output || workflow) {receipt = {...receipt, output: receipt.output || output, workflow: receipt.workflow || workflow}; revision++;}
      if (!pendente()) return {pending: false, persisted: true};
      try {storage().setItem(KEY, JSON.stringify(receipt)); return {pending: true, persisted: true};}
      catch {return {pending: true, persisted: false};}
    },
    mostra({dopoLettura} = {}) {
      if (!pendente()) return null;
      const observedRevision = revision;
      let read = false;
      const acknowledge = () => {
        if (read || observedRevision !== revision) return;
        read = true; receipt = empty();
        try {storage().removeItem(KEY);} catch { /* Acknowledged in this page even if storage is denied. */ }
        dopoLettura?.();
      };
      const message = [t('varie.sessionDeletion.partialBody'),
        receipt.output ? t('varie.sessionDeletion.outputLeft') : '',
        receipt.workflow ? t('varie.sessionDeletion.automationsUnconfirmed') : '',
      ].filter(Boolean).join(' ');
      const element = mostraToast(t('varie.sessionDeletion.partialTitle'), message, {
        chiave: KEY, tono: 'guasto', durata: 0,
        azione: {etichetta: 'Ho letto', esegui: acknowledge},
      });
      element?.querySelector('[data-toast-chiudi]')?.addEventListener('click', acknowledge, {once: true});
      return element;
    },
  };
}
