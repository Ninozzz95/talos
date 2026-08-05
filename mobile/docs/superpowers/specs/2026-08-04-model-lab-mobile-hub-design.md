# TALOS Mobile Model Lab Hub — specifica di prodotto e architettura

Data: 2026-08-04
Stato: APPROVATA DALL'OWNER, NON IMPLEMENTATA
Lane proprietaria: `mobile` soltanto
Piano: `../plans/2026-08-04-model-lab-mobile-hub-plan.md`
Ricerca: `../research/2026-08-04-model-lab-mobile-hub-research.md`

## 1. Decisione dell'owner

Model Lab non è più un pannello Impostazioni con tre linguette. Diventa una
piccola architettura di navigazione mobile:

1. una pagina hub con la capacità reale del dispositivo in cima;
2. tre schede di navigazione: **Provider e accessi**, **Catalogo modelli** e
   **Modelli locali**;
3. una pagina dedicata per ogni scheda;
4. una sola relazione lineare di ritorno dalla pagina figlia all'hub;
5. nessuna replica della scheda dispositivo dentro le pagine figlie.

L'interfaccia di tutte queste superfici deve essere governata interamente dal
Theme Engine. Una fase è implementata solo dopo una prova visiva fresca, con
screenshot tracciati, sul dispositivo Android fisico collegato.

Questa specifica non autorizza alcuna modifica alla lane desktop, al core PHP,
al validator Node o al control-plane Laravel.

## 2. Problema attuale

`TalosMobileSettingsModelsPanel.vue` contiene tre Reka Tabs e carica nello
stesso pannello configurazione provider, catalogo e modelli locali. Questa forma
ha quattro difetti strutturali:

- tratta tre destinazioni autonome come pannelli sovrapposti;
- ripete la capacità del dispositivo nelle superfici che la consumano;
- concentra filtri, dettagli, chiavi e download in una sola gerarchia visiva;
- non offre URL, cronologia e ritorno lineare per ogni area.

Il lavoro interrotto ha inoltre lasciato un contratto di capienza a metà: cinque
file modificati giudicano RAM e disco in modo non ancora coerente, alcuni
chiamanti importano un simbolo eliminato e il percorso Hugging Face usa
`gguf.totalFileSize` come se fosse il peso di una variante Q4. Al punto di
ripresa `npm run typecheck` e tre scenari focalizzati sono rossi. Questa è la
baseline reale; le affermazioni precedenti che descrivevano la lista come
completa sono superate.

## 3. Architettura dell'informazione

```text
Impostazioni
└── Model Lab                         /settings/models
    ├── Provider e accessi            /settings/models/providers
    ├── Catalogo modelli              /settings/models/catalog
    └── Modelli locali                /settings/models/local
        └── Dettaglio repository      /settings/models/local/:owner/:repo
```

Contratto esatto delle rotte:

| Nome | Path | Parent |
|---|---|---|
| `settings-models` | `/settings/models` | `settings` |
| `settings-models-providers` | `/settings/models/providers` | `settings-models` |
| `settings-models-catalog` | `/settings/models/catalog` | `settings-models` |
| `settings-models-local` | `/settings/models/local` | `settings-models` |
| `settings-models-local-repo` | `/settings/models/local/:owner/:repo` | `settings-models-local` |

`owner` e `repo` sono segmenti separati per non affidare uno slash del repository
a un parametro catch-all. `talosMobileParentRoute()` rimane l'unica autorità
per il pulsante nell'header e per System Back. Non si aggiunge un secondo tasto
Indietro nel corpo.

Il deep link storico `/settings?tab=models` rimane accettato e viene
canonicalizzato con `router.replace({ name: 'settings-models' })`; non genera
una voce nella cronologia. Sidebar, scorciatoie dalla chat e qualunque evento
`open-model-lab` puntano all'URL canonico.

## 4. Hub Model Lab

Ordine verticale obbligatorio:

1. titolo e descrizione breve;
2. `TalosMobileDeviceCapacityCard`;
3. `RouterLink` verso Provider e accessi;
4. `RouterLink` verso Catalogo modelli;
5. `RouterLink` verso Modelli locali.

Le tre schede sono link nativi perché cambiano pagina. Devono avere nome
accessibile, descrizione utile, stato sintetico reale e chevron non decorativo
per gli screen reader. Non sono tab, accordion o pulsanti con `router.push()`.

La scheda dispositivo espone solo dati misurati o uno stato dichiaratamente
sconosciuto:

- RAM utilizzabile;
- spazio allocabile;
- riserva di sicurezza di 1 GiB;
- facoltativamente ABI/runtime quando già disponibile dal contratto nativo;
- azione di nuova misura quando la lettura fallisce.

Zero byte restituiti dal plugin non significa zero spazio: viene normalizzato a
`null` e mostrato come **Da misurare**. Nessun valore sintetico viene promosso a
misura reale.

## 5. Pagine dedicate

### 5.1 Provider e accessi

Contiene provider cloud, URL locali, stato delle credenziali, prova modello e,
quando supportato realmente, accesso OAuth. Il token Hugging Face si sposta qui
dalla pagina Locale. Le chiavi restano nel secure storage e non entrano nello
store serializzato, nei log, negli screenshot o nei manifest di evidenza.

L'OAuth account Google/Apple già presente in `account.ts` appartiene alla
sincronizzazione dell'account TALOS e non viene toccato.

### 5.2 Catalogo modelli

Mantiene le capacità reali già esposte dal catalogo TALOS, ma passa da centinaia
di card simultanee a righe compatte con rendering progressivo: 40 elementi
iniziali e incrementi da 40 tramite **Mostra altri**. Ricerca o filtro provider
riporta il limite a 40. Non viene introdotta una dipendenza di virtualizzazione.

### 5.3 Modelli locali

È la superficie Hugging Face e download locale. La pagina elenco usa righe
compatte, filtri che vanno a capo sul telefono e una capienza comune a RAM e
disco. Il dettaglio repository ha una rotta propria, titolo multilinea,
descrizione/README concisa e varianti esatte. Non replica né scheda dispositivo
né pulsante Indietro.

## 6. Contratto Theme Engine al 100%

Il Model Lab non definisce un proprio mini design system. Ogni decisione
visibile — colore, fondo, bordo, testo, stato, focus, raggio, spaziatura,
dimensione icona e moto — deve risolvere attraverso il Theme Engine centrale.

Il Theme Engine viene esteso con token semantici derivati dalle identità
canoniche `density` e `radius`:

| Token CSS | Significato |
|---|---|
| `--talos-space-page` | margine interno della pagina |
| `--talos-space-section` | distanza tra sezioni |
| `--talos-space-card` | padding di card/riga |
| `--talos-space-control` | padding dei controlli |
| `--talos-space-inline` | distanza tra elementi in linea |
| `--talos-icon-size` | icona ordinaria |
| `--talos-touch-target` | bersaglio minimo, sempre 3rem/48dp |
| `--talos-radius-card` | raggio delle superfici |
| `--talos-radius-control` | raggio dei controlli |

`applyTalosMobileDesignTokens()` li applica insieme a palette, tipografia,
densità e raggi. `style.css` contiene solo default centrali equivalenti per il
boot prima dell'applicazione dell'identità. La scala dei raggi canonica esistente
rimane compatibile; le nuove scale di layout sono esportazioni centrali e
testate.

Nel perimetro Model Lab sono vietati:

- colori letterali (`#...`, `rgb(...)`, nomi palette Tailwind);
- fallback locali `var(--token, valore)`;
- classi Tailwind che codificano colore, raggio, spazio o durata;
- ombre locali prive di un token centrale;
- transizioni che ignorano i token motion o `prefers-reduced-motion`.

Percentuali strutturali, griglie e breakpoint responsive non sono valori di
tema. Le classi tipografiche globali sono ammesse solo quando la loro scala è
già collegata a `--talos-ui-scale`. Il test statico
`modelLabThemeTokenContract.test.ts` controlla l'elenco esplicito delle
superfici Model Lab; i test runtime coprono tutte le 14 identità, chiaro/scuro,
densità, raggio e moto ridotto.

## 7. Contratto unico di capienza

Una sola funzione pura produce il verdetto usato da:

- badge nella lista Hugging Face;
- filtro **Gira qui**;
- riga di dettaglio della variante;
- catalogo locale;
- eventuale azione di download.

Il verdetto è discriminato, non un booleano permissivo:

```text
unknown | fits | tight | memory-blocked | storage-blocked
```

Regole:

1. dimensione variante sconosciuta o misura dispositivo assente → `unknown`;
2. lo spazio considera sempre la riserva di 1 GiB;
3. il cancello disco precede il giudizio RAM, così il messaggio identifica il
   primo vincolo materiale;
4. il filtro positivo **Gira qui** include solo verdetti noti compatibili;
5. `unknown` appare come **Da verificare**, mai come successo;
6. RAM e disco hanno testo, rapporto della barra e rimedio distinti;
7. il gate nativo di prenotazione spazio rimane fail-closed e autorevole al
   momento del download.

## 8. Contratto Hugging Face e filtri

La lista usa `expand` per ottenere metadati e `siblings`. Non interpreta
`gguf.totalFileSize` come una variante: quel numero può rappresentare l'intero
repository o file non quantizzati. Una funzione deterministica seleziona una
variante mobile rappresentativa nell'ordine Q4 documentato; il suo peso viene
da sibling LFS quando presente o da una stima esplicitamente marcata basata sui
parametri. Nel dettaglio, `paths-info` è l'autorità esatta per byte, SHA-256,
revision e stato del file.

Semantica dei filtri:

- **Gira qui**: verdetto centrale noto, RAM e disco entrambi compatibili;
- **Chat**: tag `conversational` oppure chat template GGUF dichiarato;
- **Orientato al codice**: euristica TALOS esplicitamente etichettata, perché
  Hugging Face non espone una facet canonica equivalente;
- **Q4**: sibling/quantizzazione, non nome del repository;
- **Licenza permissiva dichiarata**: allowlist conservativa; assente, custom,
  OpenRAIL e Llama non passano;
- combinazioni: AND fra filtri attivi;
- provider: opzioni derivate dai risultati non filtrati più il valore attivo,
  così una selezione non può cancellare sé stessa;
- zero risultati: stato esplicito con **Reimposta filtri**.

Il conteggio download viene etichettato **ultimi 30 giorni**. Non si presenta
come totale storico.

## 9. OAuth provider

Decisione owner 2026-08-05: la fase è rinviata finché TALOS non dispone di un
dominio verificato. Non viene implementato il precedente callback private-use
`ai.talos://oauth/huggingface`, né una UI OAuth parziale. Token e API key
manuali restano il comportamento reale.

Quando la fase verrà riaperta, lo scope comprende tutti e soltanto i provider
la cui documentazione ufficiale corrente renda OAuth realmente implementabile
in TALOS mobile. Ogni candidato deve avere:

- flusso native/public-client senza client secret nell'APK;
- browser di sistema, mai WebView embedded;
- callback HTTPS/App Link sul dominio TALOS verificato;
- verifica obbligatoria di provider, `state`, scadenza e PKCE quando previsto;
- token e stato pendente soltanto nel secure storage;
- adapter TALOS provider-specifico e gate upstream end-to-end reale;
- minimo privilegio documentato.

Per Hugging Face il minimo privilegio deciso è soltanto `gated-repos`: Model Lab
deve leggere repository gated, non acquisire identità, profilo o e-mail. I
provider che al momento della ripresa documentano soltanto API key conservano
il flusso manuale e non vengono “OAuthizzati” per analogia.

Callback esatto, matrice provider, client registration, inventario, simboli,
RED e prove fisiche devono essere ripianificati dopo la disponibilità del
dominio e una nuova ricerca standards-first. La bozza HF-only precedente resta
soltanto storico nel ledger Fase 5.

## 10. Accessibilità, telefono e scala

- bersagli interattivi almeno 48×48dp;
- nessuno scorrimento orizzontale a 360×792 CSS px;
- filtri multilinea, titoli lunghi con wrapping e testo zoomato senza perdita;
- focus visibile dal token `focus` e ordine tastiera coerente;
- nomi accessibili univoci, stati non comunicati solo dal colore;
- moto ridotto rispettato;
- lista catalogo con massimo 40 righe al primo render;
- nessun aumento del limite del pacco d'avvio senza emendamento preventivo del
  ledger e nuova misura.

Le pagine rimangono chunk locali lazy. Il precedente dato 597.055/600.000 byte
è solo storico: il WIP rosso impedisce una misura fresca e la fase 1 deve
ristabilire il baseline reale prima della ristrutturazione.

## 11. Cancello visivo fisico, obbligatorio per ogni fase

Stati consentiti:

```text
PLANNED → RED PROVEN → GREEN AUTOMATED → GREEN UPSTREAM → GREEN DEVICE → IMPLEMENTED
```

`GREEN DEVICE` richiede tutti questi elementi:

1. APK costruito dal tree verificato e installato sul dispositivo fisico;
2. screenshot PNG fresco per ogni scenario nominato nel ledger;
3. file `manifest.md` nella stessa directory degli screenshot;
4. manifest con HEAD, dirty paths, build/APK, seriale, modello, Android,
   dimensioni fisiche, viewport CSS, DPR, tema, modalità, densità, raggio,
   route, scenario, timestamp UTC, SHA-256 del PNG, esito e difetti;
5. nessun segreto, token, username, e-mail o altro dato personale visibile;
6. lista difetti vuota.

Test, typecheck, build, Playwright, ispezione DOM o screenshot desktop non
sostituiscono questo cancello. Una cattura di una build precedente non vale. Se
il telefono non è disponibile, la fase resta al massimo `GREEN UPSTREAM` e non
può essere descritta come implementata.

Baseline fisica osservata il 2026-08-04, da riconfermare a ogni fase:

- seriale: `3B1F6DE8WTX78PET`;
- produttore/modello: OnePlus `PJZ110`;
- Android 16, API 36;
- schermo fisico: 1080×2376;
- densità override: 480 dpi;
- viewport atteso: 360×792 CSS px, DPR 3.

## 12. Compatibilità e non-obiettivi

Restano stabili:

- provider ID, adapter e wire payload esistenti;
- chat quick picker e modelli salvati;
- secure-key namespace già distribuito;
- contratto nativo download e riserva di spazio;
- deep link storico `?tab=models`;
- UI e codice desktop.

Non fanno parte di queste cinque fasi:

- import GGUF oltre il picker già consegnato. **Runtime llama.cpp e Download
  Center non sono più fuori scope:** la tranche correttiva 4.C del 2026-08-05
  li governa con una specifica dedicata;
- accettazione in-app di licenze gated;
- OAuth dell'account TALOS;
- backend di intermediazione credenziali;
- sincronizzazione cross-device;
- modifiche alla lane desktop.

## 13. Criteri finali di accettazione

La tranche è chiusa solo quando:

- tutte e cinque le fasi hanno ledger `IMPLEMENTED` con evidenza fisica valida;
- hub e pagine figlie rispettano il route tree e non duplicano il dispositivo;
- ogni superficie Model Lab passa il contratto statico Theme Engine;
- capienza, filtri e byte Hugging Face sono semanticamente veri;
- il catalogo resta utilizzabile a scala telefonica;
- la Fase 5 OAuth è implementata provider per provider con dominio/client reali
  e prove end-to-end, oppure resta esplicitamente `DEFERRED` senza UI finta e la
  tranche non viene chiamata completa;
- test interessati, suite mobile, build, bundle gate e `git diff --check` sono
  verdi;
- nessuna modifica desktop è entrata nel diff.

## 14. Emendamento 4.C — 2026-08-05

La specifica dedicata
`2026-08-05-model-lab-download-center-local-compatibility-design.md` prevale
per Settings, Download Center, trasferimento durevole, compattezza della pagina
locale, rail filtri single-line, policy contesto e matrice GGUF fisica. La Fase
5 resta deferred e non viene implicitamente autorizzata dall'emendamento.
