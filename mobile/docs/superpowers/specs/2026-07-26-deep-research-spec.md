# Deep Research — specifica tecnica

**Stato:** specifica aperta il 2026-07-26, prima dell'implementazione. Chiusa
quando la fase spedisce.

**Analisi competitor**: `docs/superpowers/research/2026-07-26-deep-research-competitor-analysis.md`
(radice, ignorato da git su richiesta dell'owner).

**Rapporto col catalogo tool**: sostituisce e amplia la riga `web_research` di
F1. Deep Research **richiede** F1 (`web_search`, `web_read`) e l'export
**richiede** F2.

---

## 0. Decisioni chiuse (VINCOLANTI)

| # | Decisione |
|---|---|
| **R1** | Esecuzione in **foreground service** con notifica di avanzamento e annullamento. |
| **R1b** | **Predisposizione cloud** (abbonamento) per la distribuzione: la stessa run deve poter migrare fuori dal telefono senza riscrivere pianificatore, verifica e dossier. |
| **R2** | **Verifica citazioni a tre livelli**, con il passaggio esatto conservato e mostrabile. |
| **R3** | **Tre livelli di profondità** scelti dall'utente, con **costo dichiarato prima**. |
| **R4** | Il risultato è un **dossier nella Libreria della chat**: report + tutte le fonti col testo estratto. |
| **R5** | **Avviabile da una chat**: il modello riconosce l'occasione e **la propone**, non la lancia. Riga nella stazione + traccia nella chat. |
| **R6** | **Ripresa dal passo raggiunto** se il processo muore. |
| **R7** | **Due ruoli**: un modello economico legge/riassume, uno forte pianifica e sintetizza. |
| **R8** | Report **navigabile**: ogni affermazione citata si tocca e mostra il passaggio esatto. |
| **R9** | Il **piano è visibile e modificabile prima di partire**, **col costo per ramo**. |
| **R10** | Report **a livelli**: risposta breve → sezioni → fonti. |
| **R11** | Il dossier **resta interrogabile** senza rifare la ricerca, ed è **esportabile**. |
| **R12** | **Ri-verifica a richiesta**: cosa è cambiato dal giorno della ricerca. |

Ereditate: **D0** app distribuita · **D6** nessun fetch automatico di URL ·
**D7** date etichettate · **D16** costo mostrato nel registro · **D22** inglese.

---

## 1. La pipeline

```
   [chat]  il modello riconosce l'occasione → PROPONE (R5)
      │                        oppure: la stazione Research
      ▼
┌─ 1. PIANO ─────────────────────────────────────────────┐
│  modello forte → rami di indagine                       │
│  MOSTRATO all'utente, MODIFICABILE, col costo per ramo  │  R9
│  ⟶ nulla parte prima del consenso                      │
└────────────────────────┬───────────────────────────────┘
                         ▼
┌─ 2. RACCOLTA (per ramo, in parallelo limitato) ────────┐
│  web_search  →  candidati                               │
│  web_read    →  pagina scaricata e ESTRATTA sul telefono│
│  modello economico → riassunto + passaggi rilevanti     │  R7
│  ogni passo salvato appena finito                       │  R6
└────────────────────────┬───────────────────────────────┘
                         ▼
┌─ 3. SINTESI ───────────────────────────────────────────┐
│  modello forte → report a livelli, ogni affermazione    │
│  legata ai passaggi da cui viene                        │  R10
└────────────────────────┬───────────────────────────────┘
                         ▼
┌─ 4. VERIFICA (tre livelli, R2) ────────────────────────┐
│  L1 il link risolve                                     │
│  L2 il passaggio citato ESISTE nel testo scaricato      │
│  L3 l'affermazione è sostenuta da quel passaggio        │
│  ⟶ ciò che non passa viene MARCATO, non nascosto       │
└────────────────────────┬───────────────────────────────┘
                         ▼
┌─ 5. DOSSIER ───────────────────────────────────────────┐
│  report + fonti col testo estratto → Libreria della chat│  R4
│  riga nella stazione Research · traccia nella chat      │  R5
└─────────────────────────────────────────────────────────┘
```

---

## 2. Esecuzione (R1, R1b, R6)

### 2.1 Il servizio

Plugin nativo `TalosResearchService`, foreground service `dataSync`:

- notifica persistente: fase corrente, fonti lette su totale stimato,
  **annulla**;
- Android concede **6 ore su 24** a questo tipo di servizio — una run da 25
  minuti sta larga, ma il consumo va contato e mostrato;
- il tocco sulla notifica riapre l'app sulla run.

### 2.2 Lo stato, e perché è la parte importante

```ts
interface TalosResearchRun {
    id: string
    sessionId: string           // la chat da cui è partita
    question: string
    depth: 'quick' | 'deep' | 'exhaustive'
    plan: TalosResearchBranch[] // modificato dall'utente prima di partire
    status: 'planning' | 'awaiting_plan_approval' | 'collecting'
          | 'synthesising' | 'verifying' | 'done' | 'cancelled' | 'failed'
    steps: TalosResearchStep[]  // append-only, ognuno salvato appena finito
    spend: { tokens: number; searches: number; pages: number }
    startedAt: string
    engine: 'device' | 'cloud'  // R1b
}
```

Lo stato è **serializzato su SQLite a ogni passo**, non tenuto in memoria. Da
questo discendono tre cose che sembrano separate e sono la stessa:

1. **R6** — Android uccide il processo, la run riprende dal passo raggiunto.
2. **R1b** — uno stato serializzabile è uno stato che può **migrare** su un
   servizio remoto: la predisposizione cloud non è codice in più, è la stessa
   proprietà.
3. **Il costo speso non si perde**: i token già pagati non si ripagano.

**Vincolo derivato:** ogni passo comunica per contratto (input → output
serializzabili), mai per variabile condivisa. È ciò che rende l'esecutore
sostituibile.

---

## 3. Il piano (R9)

Il modello forte produce rami di indagine, ciascuno con una **stima**:

```jsonc
{ "branches": [
  { "id": "b1", "question": "prezzi attuali",  "est_searches": 3, "est_pages": 5,
    "est_minutes": 3, "est_tokens": 9000 },
  { "id": "b2", "question": "recensioni reali", "est_searches": 4, "est_pages": 8,
    "est_minutes": 4, "est_tokens": 14000 }
]}
```

L'utente può **togliere, aggiungere e riformulare** un ramo, e il totale si
aggiorna sotto le dita. Gemini mostra il piano; **nessuno mostra il prezzo**.
Con BYOK paga l'utente: è dovuto.

### I tre livelli (R3)

| Livello | Fonti | Tempo | Rami |
|---|---:|---:|---:|
| Rapida | ~10 | ~3 min | 2 |
| Approfondita | ~30 | ~10 min | 4 |
| Esaustiva | ~80 | ~25 min | 6+ |

Sono **default del piano**, non gabbie: il piano resta modificabile.

---

## 4. Verifica delle citazioni (R2)

È l'attacco al difetto misurato del settore: **11–57% di citazioni allucinate**;
CiteME dà ai modelli di frontiera **4–18%** di accuratezza contro il **70%**
umano, e **35%** agli agenti con tool.

```ts
interface TalosCitation {
    claimId: string
    sourceId: string
    quote: string            // il passaggio ESATTO, conservato
    offset: [number, number] // dove nel testo estratto
    checks: {
        resolves: boolean          // L1 il link risponde
        quotePresent: boolean      // L2 il passaggio è nel testo scaricato
        claimSupported: 'yes' | 'partial' | 'no' | 'unchecked'  // L3
    }
}
```

- **L2 è puramente meccanico**: confronto del passaggio col testo estratto,
  nessun modello coinvolto, nessun costo, nessuna opinione. Prende da solo la
  categoria più grave — la citazione inventata di sana pianta.
- **L3 costa un giro di modello.** Chi ha scritto l'affermazione è il peggior
  giudice di quell'affermazione: la verifica la fa il modello **economico**, che
  non ha scritto il report, e vede solo passaggio + affermazione — non il resto
  del report, che lo influenzerebbe.
- **Ciò che non passa viene marcato, mai nascosto**: "non verificata", "solo
  parzialmente sostenuta". Nascondere un'affermazione debole è mentire due
  volte.

---

## 5. Il dossier (R4, R8, R10, R11)

### 5.1 Forma a livelli

```
▸ La risposta, in 3-5 righe               ← sempre visibile
  ▸ Sezione 1 ......................... [apri]
      testo con affermazioni citate
      └ tocco su una citazione → il PASSAGGIO ESATTO + la fonte
  ▸ Sezione 2 ......................... [apri]
  ▸ Fonti (12) ........................ [apri]
      ogni fonte: titolo · data · stato verifica · testo estratto
```

5.000 parole di fila su un telefono sono un muro. La disclosure progressiva è
già il linguaggio dell'app (reasoning, tool) e qui vale doppio.

### 5.2 Interrogabile senza rifare la ricerca (R11)

Le fonti sono nella Libreria di quella chat **col testo estratto**: una domanda
di follow-up viene risolta da `library_read` sulle fonti già pagate, **senza
toccare la rete**. Dai concorrenti una domanda di follow-up fa ripartire tutto.

### 5.3 Esportabile (R11)

Export del dossier — report + citazioni impaginate + elenco fonti — in Markdown
(sempre disponibile) e in **PDF/DOCX via F2** quando F2 è spedita. Generato sul
telefono: Gemini esporta su Google Docs, noi non usciamo dal dispositivo.

### 5.4 Ri-verifica (R12)

Un tocco su un dossier vecchio:

```
Ricontrollate 12 fonti:
   9  intatte
   2  non rispondono più          (il testo estratto resta leggibile qui)
   1  cambiata dal giorno della ricerca   [vedi differenza]
```

**Nessun concorrente può farlo**, perché nessuno conserva il testo: da loro
resta un link che marcisce. È il one-up più difficile da copiare, ed è gratuito
per noi — il testo lo abbiamo già.

---

## 6. Le due porte (R5)

Regola generale: ogni funzione ha una stazione **e** un tool.

- **Stazione** `ResearchScreen.vue` — esiste già come segnaposto ("Deep Research
  V3 — Not in this build"): diventa l'elenco delle run, con stato, costo, e
  l'avvio manuale.
- **Dalla chat**: il modello riconosce che la domanda merita una ricerca
  profonda e **la propone** con la stima. Non la lancia: è l'unico tool che può
  costare venti minuti e metà batteria (R5, coerente con R3).
- **L'esito atterra in entrambe**: riga nella stazione, traccia muta nella chat
  (`TalosMobileTraceRow`), che apre il dossier.

---

## 7. Modelli (R7)

| Ruolo | Chi | Cosa fa |
|---|---|---|
| **Pianificatore/sintetizzatore** | modello forte (quello della chat) | piano, sintesi, report |
| **Lettore** | modello economico, scelto in Impostazioni | riassume ogni pagina, estrae i passaggi |
| **Verificatore L3** | il lettore (≠ da chi ha scritto) | giudica se l'affermazione è sostenuta |

È il pattern **executor + advisor** della matrice Claude. Leggere 30 pagine col
modello di punta costa parecchie volte tanto a parità di risultato — e con BYOK
il risparmio è dell'utente. Default sensati, entrambi cambiabili nel Model Lab.

---

## 8. Criteri di accettazione

**Esecuzione**
1. Uscendo dall'app durante una run, la notifica mostra l'avanzamento e la run
   continua.
2. Annullando dalla notifica la run si ferma entro 5 secondi e il parziale è
   conservato.
3. Uccidendo il processo, alla riapertura la run **riprende dal passo raggiunto**
   — verificato contando le chiamate di rete, che non devono ripetersi.
4. Nessuna fase richiede il modello forte per leggere una pagina.

**Piano e costo**
5. Nulla parte prima dell'approvazione del piano.
6. Togliendo un ramo, il costo stimato **scende** in modo visibile.
7. Il costo speso a fine run è mostrato accanto alla stima iniziale.

**Citazioni**
8. Una citazione il cui passaggio non esiste nel testo scaricato è marcata
   `quotePresent: false` e **appare marcata all'utente**.
9. Toccando un'affermazione compare il passaggio esatto, non un riassunto.
10. La verifica L3 non è eseguita dal modello che ha scritto il report.

**Dossier**
11. Le fonti col testo estratto sono nella Libreria di quella chat e nella
    galleria media.
12. Una domanda di follow-up sul dossier **non genera traffico di rete**.
13. L'export contiene report, citazioni e fonti; si apre in un lettore esterno.
14. La ri-verifica distingue: intatta / irraggiungibile / cambiata, e sulla
    cambiata mostra la differenza.

**Le due porte**
15. Il modello **propone** e non avvia; l'avvio è un tocco dell'utente.
16. La run compare nella stazione **e** come traccia nella chat d'origine.

**Privacy**
17. Fuori dal dispositivo escono solo: le query di ricerca e le chiamate ai
    provider di modello. Nessuna pagina viene inviata a un servizio di
    estrazione. Verificato con un test che intercetta il traffico.

---

## 9. Fasi

| Fase | Contenuto | Dipende da |
|---|---|---|
| **R-1** | Stato serializzabile + foreground service + notifica + ripresa. Nessuna intelligenza: una run finta che dorme e riprende. | — |
| **R-2** | Piano modificabile col costo + i tre livelli. | R-1 |
| **R-3** | Raccolta a due modelli + dossier in Libreria. | F1, R-2 |
| **R-4** | Verifica a tre livelli + report navigabile a livelli. | R-3 |
| **R-5** | Follow-up senza rete + export (F2) + ri-verifica. | R-4, F2 |

L'ordine è deliberato: **R-1 costruisce la parte che non si può aggiungere
dopo** — lo stato serializzabile è insieme la ripresa (R6) e la giuntura cloud
(R1b). Farla per ultima significherebbe riscrivere.

---

## 10. Checkpoint di ricerca web

| Data | Query | Fonti | Impatto |
|---|---|---|---|
| 2026-07-26 | competitor deep research 2026 | presenc.ai, felloai, guptadeepak, atlasworkspace | OpenAI 50–200 fonti/10–30 min · Gemini 30–150/5–15 · Claude 20–100/5–20 (migliore su fonti contraddittorie) · Perplexity 2–4 min (più verificabile) · Grok 30–80/3–12 |
| 2026-07-26 | architetture open source | GPT Researcher (28k⭐, planner→executor→publisher), langchain open_deep_research (supervisor + subagenti), STORM | conferma il disegno a rami paralleli; il campo OSS **fatica proprio sulla qualità delle citazioni** |
| 2026-07-26 | citazioni allucinate e verifica | arxiv 2605.06635, arxiv 2604.03173, CiteME, MisCiteBench | **11–57%** di citazioni allucinate; frontier 4–18% vs 70% umano; **triplo controllo**: risolve / pertinente / sostenuta → è R2 |
| 2026-07-26 | limiti background Android | developer.android.com FGS timeout, ProAndroidDev | `dataSync` **6h/24h**; Doze a schermo spento; job da FGS soggetti a quote → **foreground service con notifica**, non WorkManager |
| 2026-07-26 | presentazione dei report | presenc.ai, singularitymoments, atlasworkspace | Gemini mostra il piano **e lo fa modificare**; Perplexity ha Collections e citazioni in linea; OpenAI produce 5.000+ parole → su telefono serve **a livelli** |

**Da verificare prima di R-1**: comportamento reale di `onTimeout` sul FGS con
Android 15/16; costo in batteria di una run da 25 minuti misurato sul
dispositivo; se la notifica di avanzamento sopravvive alle personalizzazioni OEM
più aggressive (Xiaomi, Oppo).
