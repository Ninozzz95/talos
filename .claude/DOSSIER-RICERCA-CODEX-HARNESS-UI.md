# Dossier di ricerca — Codex Harness UI

Data: 2026-08-24  
Stato: ricerca conclusa; nessun codice di prodotto autorizzato o modificato  
Autorità: la sezione 9 di `DECISIONI-CODEX-HARNESS-UI.md` è la baseline finale e sostituisce le decisioni precedenti che contraddice.

## 1. Perimetro effettivo

Questi non sono suggerimenti del redattore: sono i vincoli già decisi dall'owner.

- Una sola UI responsive per mobile e desktop.
- HTML, CSS e JavaScript statici; piccolo server `node:http`.
- Nessun Vue, Vite, framework o nuova dipendenza npm.
- Nessuna dipendenza dal codice o dal commit mobile; base Git `587f989fd3137547732b28c1446e8b588df11311`.
- Nessuna modifica a `TALOS-BANCO` o `AVM-harness`.
- Dati reali solo in Board/Dashboard; tutto il resto resta dummy UI funzionante e visibilmente marcata `Demo UI · non collegato`.
- Allowlist iniziale: `esiti-22ago-progetti` e `esiti-22ago-storia`.
- Server locale, same-origin, loopback; niente deployment.
- Qualità proporzionata a uno strumento interno: Chrome usato dall'owner, sei stati canonici del mockup, niente offline/IndexedDB/service worker, niente gate WCAG o budget prestazionali bloccanti.
- Mockup copiato integralmente e conservato come riferimento immutato, con provenienza esplicita.
- Commit piccoli; nessun push.

## 2. Evidenze locali

### 2.1 Worktree destinazione

- Percorso: `C:\Users\Antonino\Desktop\projects\AVM-harness-ui`.
- Ramo: `lane/harness-ui`.
- HEAD: `587f989fd3137547732b28c1446e8b588df11311`.
- Stato al 2026-08-24: pulito; `harness-ui/` non esiste.
- Nessun file del worktree destinazione è stato modificato durante questa ricerca.

### 2.2 Mockup consegnato

Sorgente ispezionata:

`C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\harness-ui-mockup-2026-08-20\talos-responsive-harness-mockup`

Contiene 18 file interni: 7 file di implementazione/documentazione, 7 preview e 4 immagini di riferimento. Lo ZIP esterno non fa parte dei 18 file da copiare.

La documentazione non contiene letteralmente "6 risoluzioni":

- `UI_REVIEW.md` elenca 8 viewport: `320×720`, `360×800`, `390×844`, `430×900`, `768×1024`, `1024×800`, `1280×800`, `1440×900`;
- la cartella contiene 7 preview PNG;
- `CONSEGNA-CODEX-HARNESS-UI.md`, righe 63-68, nomina invece 6 stati di accettazione: desktop, laptop, tablet, mobile, mobile stretto e capacità.

La lettura deterministica del requisito è quindi **sei stati canonici**, non sei dimensioni uniche:

| Stato | Artefatto | Viewport |
|---|---|---:|
| desktop | `preview-desktop.png` | 1440×900 |
| laptop | `preview-laptop.png` | 1024×800 |
| tablet | `preview-tablet.png` | 768×1024 |
| mobile | `preview-mobile.png` | 390×844 |
| mobile stretto | `preview-mobile-narrow.png` | 320×720 |
| capacità | `preview-mobile-capabilities.png` | 390×844 |

`preview-mobile-review.png` resta parte obbligatoria della copia intatta e della verifica funzionale, ma non aggiunge una settima risoluzione al gate. Le altre viewport di `UI_REVIEW.md` restano evidenza storica, non nuove soglie bloccanti. Questa normalizzazione applica le parole già presenti nella consegna; non inventa una matrice nuova.

Il mockup contiene le superfici chat, diff, terminale, browser, Board/Dashboard, automazioni, impostazioni, pannello sessioni, inspector, context/files/agents, sheets, modello, permessi, ambiente, capabilities, control/session tree, rinomina, riferimenti file, command palette, approval e queue. Il codice corrente è un prototipo locale: le azioni sono simulate e non chiama API reali.

### 2.3 Browser effettivo dell'owner

- Associazione Windows HTTP predefinita: `ChromeHTML`.
- Eseguibile: `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Versione rilevata: `151.0.7922.173`.

Il gate browser viene quindi fissato a **Google Chrome 151.0.7922.173 su Windows** per questa consegna. Una futura versione installata potrà essere misurata e riportata, ma non trasforma il gate in una matrice multi-browser.

### 2.4 Dati reali in allowlist

Ispezione read-only completa delle due campagne iniziali:

| Campagna | JSONL | Righe valide | File `.costo.json` esistenti |
|---|---:|---:|---:|
| `esiti-22ago-progetti` | 8 | 120 | 8 |
| `esiti-22ago-storia` | 8 | 40 | 8 |

Tutte le 160 righe sono JSON valido. Sono stati verificati anche esiti non binari (`fermato`, `inventato`, `manomesso`, `ignoto`, `rottoAltrove`) e un caso in cui `cambiamenti` è assente. Il lettore non può quindi assumere due soli esiti né la presenza uniforme di tutti i campi opzionali.

Il contratto frontend ammesso resta quello della §9:

- `harness`, `id`, `difficolta`, `esito`, `ms`, `costoUsd`, `corpus`, `modello`, `quota`, `quando`;
- `giriDelTask[]`;
- `detto`, come testo non fidato e solo su richiesta;
- `cambiamenti.quanti`.

Per il solo costo aggregato si applica inoltre DEC-026: il server legge il
sidecar esistente `<harness>.costo.json`, senza inoltrarne la forma grezza al
browser.

Ogni altro campo osservato deve essere ignorato, non inoltrato implicitamente al browser.

### 2.5 Incompatibilità reale fra costo JSONL e costo del rapporto

`rapportoCampagna.mjs` legge come fonte primaria `<harness>.costo.json` (righe 116-117); la somma di `costoUsd` nelle righe JSONL è soltanto un'altra misura e non coincide.

| Campagna | Somma `costoUsd` nelle righe | Fonte usata dal rapporto | Delta |
|---|---:|---:|---:|
| `esiti-22ago-progetti` | 0.820813959 | 0.846658447 | +0.025844488 |
| `esiti-22ago-storia` | 1.365090835 | 0.660550154 | -0.704540682 |

Con il contratto finale "solo JSONL + rapporto opaco", il costo mostrato dalla UI **non può contemporaneamente** essere calcolato dai JSONL e coincidere con il costo stampato dal rapporto. Non è un dubbio progettuale: i valori verificati sono diversi.

La gerarchia decisionale risolve già il punto: DEC-026, mantenuta da DEC-054
insieme a DEC-019…028, stabilisce che la UI legge in sola lettura gli esistenti
`<harness>.costo.json` come fonte primaria. La somma delle righe si usa soltanto
quando il relativo file manca e deve essere marcata `~`; assenza totale resta
`null`. Quindi il delta sopra è una prova per il test di regressione, non una
domanda da sottoporre di nuovo all'owner.

### 2.6 Il rapporto ha una sorgente decisa, ma l'artefatto manca ancora

Non esiste nelle due campagne, né altrove in `TALOS-BANCO`, un `rapporto.txt` o altro file di output già catturato. `rapportoCampagna.mjs` stampa su stdout e non contiene scritture su disco.

Inoltre:

- DEC-015 vieta a Harness UI `child_process`, `exec` e `spawn`;
- DEC-054 conferma DEC-015: il server non lancia e non cattura il rapporto;
- `rapportoCampagna.mjs` importa `HARNESS` da `harness.mjs`;
- l'import di `harness.mjs` esegue a livello modulo `spawnSync('powershell.exe', ...)` e legge le variabili utente Windows i cui nomi terminano in `API_KEY` o `_TOKEN` (i valori non vengono stampati);
- il rapporto usa anche `variante`, `erroreDellHarness` e funzioni semantiche
  del banco che non appartengono al contratto di riga della §9; il sidecar
  `<harness>.costo.json` è invece già coperto da DEC-026.

La strada è già stabilita: il proprietario di ciascuna corsa, fuori dalla lane
Harness UI e quando la campagna è stabile, genera
`<campagna>/rapporto.txt` con un puro redirect di shell. Harness UI legge quel
file byte-per-byte e lo mostra come testo preformattato opaco. Nessuna riga di
codice di TALOS-BANCO cambia e Harness UI non avvia processi.

Il metodo non è quindi un gate decisionale. È invece una **dipendenza esterna
non ancora soddisfatta**: finché i proprietari delle due campagne non producono
i rispettivi `rapporto.txt`, il pannello deve restituire uno stato esplicito
`Rapporto non ancora prodotto` e il gate end-to-end del rapporto resta rosso.

## 3. Ricerca ufficiale e decisioni upstream

### 3.1 Adottare direttamente

#### Node.js 24.18.0, sola libreria standard

Pin: **Node.js 24.18.0**, già presente sulla macchina e già pin esatto nel job mobile della CI AVM.

- [`node:http`](https://nodejs.org/download/release/v24.18.0/docs/api/http.html) è stabile e volutamente low-level: è adatto a un server locale piccolo e permette streaming senza bufferizzare tutto.
- [`node:readline`](https://nodejs.org/download/release/v24.18.0/docs/api/readline.html) documenta `createReadStream` + `for await...of` con `crlfDelay: Infinity`, adatto ai JSONL.
- [`node:test`](https://nodejs.org/download/release/v24.18.0/docs/api/test.html) è stabile e copre la suite senza dipendenze.
- Il [Permission Model](https://nodejs.org/download/release/v24.18.0/docs/api/permissions.html) è stabile e può negare scritture, child process, worker e addon. È una cintura di sicurezza, non una sandbox; segue i symlink fuori dalle root, quindi non sostituisce `realpath` e il controllo di contenimento.
- WHATWG `URL`, `node:path`, `node:fs` e `node:crypto` vengono usati direttamente per parsing URL, contenimento, streaming e hash.

Decisione: **adopt direct**, pin 24.18.0, nessuna dipendenza npm.

#### Standard del dato e del browser

- [RFC 8259](https://www.rfc-editor.org/info/rfc8259/) per JSON UTF-8 e valori rappresentabili.
- [WHATWG HTML — `dialog`](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element) per i dialoghi già presenti nel mockup.
- [CSP Level 3](https://www.w3.org/TR/CSP/) e [OWASP HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) per header same-origin, `nosniff`, blocco framing e assenza di contenuti remoti.
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal) per fixture con `..`, separatori Windows, percent-encoding e doppio encoding.

Decisione: **adapt behind AVM-owned boundaries**. Gli standard guidano parser, header e test; non diventano un framework.

#### Chrome headless senza libreria browser

La documentazione ufficiale di [Chrome Headless](https://developer.chrome.com/docs/automation-and-testing/headless-cli) supporta `--headless`, `--screenshot`, `--window-size` e `--dump-dom` direttamente dall'eseguibile.

Decisione: **adopt direct** l'eseguibile Chrome già installato, pin di prova `151.0.7922.173`; niente Playwright, Puppeteer o Selenium.

### 3.2 Upstream valutati e rifiutati

| Upstream | Pin ispezionato | Licenza | Decisione e motivo |
|---|---|---|---|
| [`http-server`](https://github.com/http-party/http-server/releases/tag/v14.1.1) | 14.1.1 / `af0ac3e` | MIT | Rifiutato: dipendenze npm, superficie più ampia, default generalisti (listing/proxy/bind) e nessuna API campagne. |
| [`serve-static`](https://github.com/expressjs/serve-static/tree/v2.2.1) | 2.2.1 | MIT | Rifiutato: richiede middleware/final handler e non risolve API, allowlist o report. |
| [`serve-handler`](https://github.com/vercel/serve-handler) | 6.1.7 | MIT | Rifiutato: dipendenza e routing statico molto più ampi del bisogno interno. |
| [Express](https://github.com/expressjs/express/releases/tag/v5.2.1) | 5.2.1 | MIT | Rifiutato: framework e dipendenze contrari alla §9 per cinque endpoint GET. |
| [Ajv](https://github.com/ajv-validator/ajv/releases/tag/v8.20.0) | 8.20.0 / `0fba0b8` | MIT | Rifiutato come runtime: eccellente validatore JSON Schema, ma qui non si introduce un nuovo schema generale e la §9 vieta dipendenze npm. Il parser AVM sarà una whitelist stretta del contratto esistente, non una reimplementazione di JSON Schema. |

Nessun upstream rifiutato verrà vendorizzato o imitato. Il comportamento specifico che resta AVM-owned è deliberatamente piccolo: allowlist di due campagne, lettura JSONL e cinque route locali.

### 3.3 Esecuzione dal server esclusa

La documentazione Node distingue `exec`, che usa una shell e non deve ricevere input non fidato, da [`execFile`](https://nodejs.org/download/release/v24.18.0/docs/api/child_process.html#child_processexecfilefile-args-options-callback), che avvia direttamente un eseguibile con argomenti separati e `shell: false` di default.

Anche se `execFile` è tecnicamente più sicuro di `exec`, questa opzione è
**rifiutata definitivamente**: contraddice DEC-015 e DEC-054 e, nel banco
attuale, l'import successivo avvia comunque PowerShell e legge l'ambiente
utente. Non viene mantenuta come alternativa futura nel ledger di questa
consegna.

## 4. Contratto tecnico raccomandato entro il perimetro già deciso

- Server bind solo a `127.0.0.1`, porta predefinita `4174`; override host ammesso solo se resta loopback.
- `TALOS_BANCO_DIR` assoluto e leggibile obbligatorio; fail-closed.
- `TALOS_HARNESS_UI_CAMPAIGNS` deve risolversi esattamente nell'allowlist iniziale; nessun glob di input e nessun nome proveniente direttamente dall'URL.
- `realpath` sia della root sia di ogni file, rifiuto di symlink/junction che
  esce dalla root; per i dati sono ammessi soltanto `.jsonl`, i corrispondenti
  `<harness>.costo.json` e il basename fisso `rapporto.txt`.
- Limiti espliciti di file, riga, righe aggregate, pagina e output del report; errori per-riga esposti come diagnostica senza arrestare la campagna.
- JSONL letto in streaming e normalizzato in un oggetto che conserva solo i campi ammessi.
- `detto` mai inserito con `innerHTML`, mai loggato, mai esportato; reso con `textContent` soltanto dopo azione dell'owner e cancellabile dalla memoria UI.
- `cambiamenti` espone soltanto `quanti` nel contratto finale.
- API JSON same-origin sotto `/api/v1`; solo `GET` e `HEAD`; nessun CORS; ogni altro metodo `405`.
- Risposte con CSP restrittiva, `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, referrer policy e cache disabilitata per API/evidenze.
- Aggiornamento solo su pulsante: nuova lettura, nuovo timestamp e SHA-256; nessun watcher o polling.
- Nessun uso di `localStorage`, IndexedDB, service worker o cache offline.
- Dati provenienti dal banco sempre costruiti via DOM/text node; nessun HTML non fidato.
- Il tema resta quello del mockup e delle sue custom properties; non si introduce un secondo theme engine e non si collega `mobile/`.

## 5. Gate ancora realmente aperti

### GATE-R01 — Metodo risolto; artefatti esterni in attesa

**Risolto da DEC-015 e DEC-054.** Harness UI legge
`<campagna>/rapporto.txt`; il proprietario della corsa lo produce con redirect
di shell. Nessuna decisione resta aperta. La dipendenza è oggi non soddisfatta
per entrambe le campagne dell'allowlist e non viene mascherata con un mock.

### GATE-R02 — Risolto da DEC-026

**Risolto.** Fonte primaria `<harness>.costo.json`; fallback somma JSONL marcata
`~`; assente `null`. Il rapporto resta opaco e non viene riparsato. Il gate
reale confronterà il costo UI con il rapporto quando i due `rapporto.txt`
saranno stati prodotti.

## 6. Conclusione della ricerca

Il perimetro statico/Node standard è tecnicamente pronto e non richiede alcun
upstream esterno. Il percorso sicuro, testabile e proporzionato è definito. Il
rapporto non richiede più una decisione: richiede che chi possiede le corse
produca i due artefatti quando Stadio B lo consente. Anche il costo è già
deciso da DEC-026. Non restano domande funzionali: restano la dipendenza
esterna dei due report e l'approvazione esplicita del ledger prima del codice.
Nessun dubbio richiede di riaprire mobile, desktop, framework, offline, WCAG,
browser o TALOS-BANCO.
