/**
 * artifact-store.mjs — l'HTML degli artefatti (attrezzo `artifact_create`
 * in talosHarness.mjs), tenuto in memoria per essere servito via GET con
 * la SUA propria Content-Security-Policy, permissiva SOLO per quella
 * risposta (vedi la rotta in http-app.mjs).
 *
 * ⛔⛔⛔ 28/8 — PERCHÉ NON `srcdoc`, misurato dal vivo e non ipotizzato: un
 * documento `about:srcdoc` EREDITA la Content-Security-Policy della
 * pagina che lo crea (regola dello standard, non un bug del browser). Con
 * lo `script-src 'self'` di tutto il resto di Harness UI
 * (`SECURITY_HEADERS`, http-app.mjs), un `<meta>` CSP permissivo scritto
 * DENTRO il srcdoc veniva ignorato: lo script del modello non partiva
 * mai, nessuno `<style>` si applicava — verificato con una sonda
 * cross-frame via `postMessage` (zero eseguiti, in tre varianti diverse,
 * anche senza alcun sandbox). Una risposta HTTP VERA, con la SUA propria
 * intestazione, non eredita niente dalla pagina che la incorpora — è la
 * stessa architettura di Claude Artifacts (bloom.security, 28/8):
 * un'origine/risposta separata, non un frammento incollato nella pagina
 * principale.
 *
 * ⛔ Solo in memoria, stesso principio di session-registry.mjs
 * (sessioni): non sopravvive a un riavvio del server — accettabile per
 * uno strumento locale owner-only, dichiarato qui perché non diventi
 * un'assunzione silenziosa.
 *
 * ⭐ 29/8 — copia PORTATA verbatim dal canonico (ledger §17, FASE G.2):
 * zero dipendenze cross-modulo, zero adattamento richiesto.
 */
import { randomBytes } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';

/*
 * ⛔⛔ 70-B (30/09/2026 notte, owner «Riuso della chat») — l'archivio VERO del telefono: su disco, nella cartella di
 * stato del server (`state/artifacts/<id>.html`), così un artefatto sopravvive a un riavvio del server come le sessioni.
 * Lo stesso schema di `TalosArtifactStore.kt` della chat: un file per id, id accettato SOLO a forma di UUID (niente
 * `..`, niente `/`), scrittura atomica (nome temporaneo aperto con `wx`, poi `rename`). L'HTML si legge dalla rotta
 * `GET /api/v1/artifacts/<id>` dietro il segreto del 70-A e si apre nella finestra isolata della chat, mai qui.
 * Le tre funzioni in memoria qui sotto restano per i test e come default di `agent-service.mjs`.
 */
const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function creaArchivioArtefatti({ cartella }) {
  const percorsoDi = (id) => {
    if (typeof id !== 'string' || !FORMA_UUID.test(id)) throw new Error('artefatto: id non valido');
    return join(cartella, `${id}.html`);
  };
  return {
    salva(id, html) {
      const finale = percorsoDi(id);
      mkdirSync(cartella, { recursive: true });
      const temporaneo = join(cartella, `.${id}.${randomBytes(6).toString('hex')}.tmp`);
      const descrittore = openSync(temporaneo, 'wx', 0o600);
      try {
        writeSync(descrittore, html);
      } catch (errore) {
        closeSync(descrittore);
        unlinkSync(temporaneo);
        throw errore;
      }
      closeSync(descrittore);
      renameSync(temporaneo, finale);
    },
    leggi(id) {
      let percorso;
      try {
        percorso = percorsoDi(id);
      } catch {
        return null;
      }
      try {
        return readFileSync(percorso, 'utf8');
      } catch (errore) {
        if (errore?.code === 'ENOENT') return null;
        throw errore;
      }
    },
  };
}

const artefatti = new Map();

export function salvaArtefatto(id, html) {
  artefatti.set(id, html);
}

export function leggiArtefatto(id) {
  return artefatti.get(id) ?? null;
}

/** Solo per i test: azzera lo store fra un test e l'altro (Map globale al modulo). */
export function svuotaArtefattiPerTest() {
  artefatti.clear();
}
