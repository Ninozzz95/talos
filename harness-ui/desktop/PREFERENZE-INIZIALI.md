# Initial preferences written by the installer

The installer page asks two questions: automatic updates, and the public model list from OpenRouter. It writes the answers to a
file; the app reads it once, at the first start that finds it, before the local service and the updater start
(`harness-ui/desktop/preferenze-iniziali.mjs`). That is normally the first start after installing, also on a computer where an
earlier TALOS was already used: there, the first file that appears is applied with the rules below, and any later one is not. *La versione italiana è più sotto.*

## Where

`%APPDATA%\TALOS\preferenze-iniziali.json` — the TALOS data folder of the user (the app's `userData`). It is read from **this folder
only**: never from the installation folder, the working folder or a path given elsewhere. In the preview build the data folder is the
preview's own.

## Shape

UTF-8 JSON, at most 4 KB:

```json
{
  "schema": "talos.initial-preferences.v1",
  "automaticUpdates": false,
  "publicModelCatalog": false
}
```

| Field | Type | Meaning |
|---|---|---|
| `schema` | string, optional | If present it must be `talos.initial-preferences.v1`; any other value makes the file unreadable. |
| `automaticUpdates` | boolean, optional | `false`: the app does not check, download or install updates on its own (Settings → Updates → Automatic updates off). `true`: on, only if the person has not chosen yet. |
| `publicModelCatalog` | boolean, optional | `false`: the app does not ask openrouter.ai for its public model list until the person picks an OpenRouter model or adds an OpenRouter key (Settings → Security and privacy → Public model list off). `true`: on, only if the person has not chosen yet. |

A missing field means "no choice": the app keeps its default. Any other field is ignored.

## Rules

1. **Once.** After reading, the file is renamed `preferenze-iniziali.letto.json` ("read"). From then on a new `preferenze-iniziali.json`
   is not applied; it is renamed `preferenze-iniziali.ignorato.json`. An unreadable file is marked read and applies nothing. If a write
   fails, the file stays and the next start tries again (applying it again gives the same result).
2. **It never turns on what the person turned off.** `false` always applies; `true` applies only where no choice is saved yet.
3. **Only these two settings.** The app writes only `automatici` in `aggiornamenti.json` (keeping `ultimoControllo`) and only `acceso`
   in `.catalogo-pubblico.json`, both in the same folder. Nothing else changes.

The environment variables `TALOS_DESKTOP_AGGIORNAMENTI=off` and `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off` win over the file and over the
settings: with them, the switch stays off.

---

# Preferenze iniziali scritte dall'installatore

La pagina dell'installatore fa due domande: gli aggiornamenti automatici e l'elenco pubblico dei modelli di OpenRouter. Scrive le
risposte in un file; l'app lo legge una volta sola, al primo avvio che lo trova, prima che partano il servizio locale e
l'aggiornatore. Di solito è il primo avvio dopo l'installazione, anche su un computer dove una TALOS precedente era già usata: lì
il primo file che compare si applica con le regole qui sotto, e quelli dopo no.

- **Dove:** `%APPDATA%\TALOS\preferenze-iniziali.json`, la cartella dati di TALOS dell'utente, e **solo lì**.
- **Forma:** JSON come sopra; `automaticUpdates` e `publicModelCatalog` booleani e facoltativi; un campo assente vuol dire «nessuna
  scelta»; ogni altro campo si ignora; `schema`, se c'è, deve essere `talos.initial-preferences.v1`.
- **Regole:** (1) una volta sola: dopo la lettura diventa `preferenze-iniziali.letto.json` e un file nuovo non si applica più (diventa
  `preferenze-iniziali.ignorato.json`); (2) non accende mai ciò che la persona ha spento: `false` vale sempre, `true` solo dove non c'è
  ancora una scelta salvata; (3) tocca solo le due impostazioni (`automatici` in `aggiornamenti.json`, `acceso` in `.catalogo-pubblico.json`).
- Le variabili `TALOS_DESKTOP_AGGIORNAMENTI=off` e `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off` vincono sul file e sulle impostazioni.
