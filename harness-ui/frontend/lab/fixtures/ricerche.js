/*
 * Fixture del lotto L7 — la Ricerca approfondita, nella forma ESATTA della rotta nuova
 * `GET /api/v1/sessions/:id/research`:
 *   { id, domanda, stato, avviataAlle, conclusaAlle|null, reportLibraryId|null, motivo, padreId|null,
 *     nome, ultimoMessaggio }
 * con `stato` fra: running · paused · done · cancelled · failed · senza-rapporto ·
 * bloccata-dal-permesso · giri-esauriti.
 *
 * ⛔ IL CASO CHE CONTA È IL TERZO, `ric-bloccata`: è la ricerca vera dell'11/09/2026 dell'owner.
 *   Nove ricerche web, quattordici pagine aperte, 484.171 token pagati, e in Libreria è finita una
 *   SCUSA da 290 byte, mostrata dalla sezione come «Conclusa». La scusa qui sotto è **verbatim**
 *   (`.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md` §1.4) e sta in `ultimoMessaggio`, dove
 *   deve stare: il laboratorio serve anche a far vedere che quel testo NON compare mai come
 *   rapporto.
 *
 * ⛔ Il rapporto vero non è scritto a mano: lo costruisce `documentoRapporto()` dal record, con lo
 *   stesso ordine di `mobile/src/lib/research/researchReport.ts:105-150`. Scrivere prosa e record a
 *   mano vorrebbe dire due verità da tenere allineate, e la prima volta che divergono la fixture
 *   proverebbe il contrario di quello per cui esiste.
 */

/** La scusa da 290 byte, com'è sul disco. Non è un rapporto, e la sezione non deve mai dire che lo è. */
export const SCUSA_290 = 'La sessione è in sola lettura, quindi non posso creare documenti direttamente. Tuttavia, posso darti il contenuto completo in un formato pronto per essere salvato, o posso provare a scriverlo in un file del workspace. Vuoi che cerchi il modo per salvarlo in un file markdown nel workspace?';

const PAROLA_VERDETTO = new Map([
  ['yes', 'sostenuta dalla fonte'],
  ['partial', 'sostenuta solo in parte'],
  ['no', 'NON sostenuta dalla fonte'],
  ['contested', 'contesa — le fonti non concordano'],
  ['unchecked', 'non verificata'],
]);

/** Ricostruisce il file del rapporto: prosa per una persona, record recintato per il bilancio. */
export function documentoRapporto(record) {
  const quante = (quale) => record.claims.filter((c) => c.checks.claimSupported === quale).length;
  const verdetto = [
    `Affermazioni: ${record.claims.length}`,
    `sostenute: ${quante('yes')}`,
    `in parte: ${quante('partial')}`,
    `non sostenute: ${quante('no')}`,
    `non verificate: ${quante('unchecked')}`,
  ].join(' · ');
  const prosa = [
    `# ${record.question}`,
    '',
    record.summary,
    '',
    verdetto,
    record.judge
      ? `Verifica eseguita da: ${record.judge} — mai dal modello che ha scritto il rapporto.`
      : 'Verifica non eseguita: nessun giudice indipendente era disponibile.',
    '',
    '## Le affermazioni',
    ...record.claims.map((entrata, indice) => {
      const fonte = record.sources[entrata.sourceIndex - 1];
      return [
        '',
        `### ${indice + 1}. ${entrata.text}`,
        `Esito: ${PAROLA_VERDETTO.get(entrata.checks.claimSupported) || 'non verificata'}${entrata.checks.supportReason ? ` — ${entrata.checks.supportReason}` : ''}`,
        entrata.passage ? `\n> ${entrata.passage}` : '\n> (il passaggio citato non è nel testo della fonte)',
        '',
        fonte ? `Fonte: ${fonte.title} — ${fonte.url}${fonte.obtained === 'snippet' ? ' (solo estratto dal motore di ricerca)' : ''}` : 'Fonte: citata ma mai raccolta.',
      ].join('\n');
    }),
    '',
    `## Fonti (${record.sources.length})`,
    ...record.sources.map((fonte, indice) => [
      `${indice + 1}. ${fonte.title} — ${fonte.url}`,
      `   ${fonte.publishedAt ? `data dichiarata: ${fonte.publishedAt}` : 'data non dichiarata'}`,
      `   ${fonte.obtained === 'page' ? 'pagina letta' : 'solo estratto dal motore di ricerca'}`,
    ].join('\n')),
  ].join('\n');
  return `${prosa}\n\n\`\`\`talos-research-report\n${JSON.stringify(record)}\n\`\`\`\n`;
}

const DOMANDA_LUNGA = 'Come stanno evolvendo gli harness agentici desktop nel 2026 e quali capacità (controllo del computer, memoria, verifica delle fonti) separano i primi tre dai concorrenti?';

/*
 * Un record completo: cinque verdetti diversi su cinque affermazioni, sei fonti di cui due dello
 * STESSO dominio — così «6 fonti» si legge come «5 prove distinte su 6 indirizzi» e si vede a colpo
 * d'occhio che due non sono due.
 */
const RECORD_PIENO = {
  version: 1,
  question: DOMANDA_LUNGA,
  summary: 'Nel 2026 gli harness desktop convergono su tre capacità: il controllo del computer con approvazioni esplicite, una memoria che sopravvive alla sessione, e una verifica delle fonti che resta consultabile dopo la corsa. La terza è quella su cui la distanza è più larga: quasi tutti citano un indirizzo, quasi nessuno conserva il passaggio da cui la citazione viene.',
  judge: 'un secondo modello, diverso da quello che ha scritto',
  claims: [
    {
      text: 'Gli harness che mostrano un piano prima di eseguirlo lasciano alla persona la possibilità di cambiarlo.',
      sourceIndex: 1,
      passage: 'After you enter your question, it creates a multi-step research plan for you to either revise or approve.',
      checks: { resolved: 'page', quotePresent: true, quoteSpan: { from: 1840, to: 1948 }, claimSupported: 'yes', supportReason: 'il passaggio dice esattamente che il piano si rivede o si approva', judge: 'un secondo modello', judgedAt: '2026-09-11T20:41:00.000Z' },
    },
    {
      text: 'Il rapporto finale si esporta in un documento modificabile.',
      sourceIndex: 1,
      passage: 'a comprehensive report of the key findings, which you can export into a Google Doc',
      checks: { resolved: 'page', quotePresent: true, quoteSpan: { from: 2210, to: 2292 }, claimSupported: 'partial', supportReason: 'vale per un solo prodotto, non per la categoria come dice l’affermazione', judge: 'un secondo modello', judgedAt: '2026-09-11T20:41:12.000Z' },
    },
    {
      text: 'Le citazioni restano verificabili nel tempo, anche quando la pagina cambia.',
      sourceIndex: 3,
      passage: 'thorough answers, complete with easy-to-check citations',
      checks: {
        resolved: 'page',
        quotePresent: true,
        quoteSpan: { from: 980, to: 1034 },
        claimSupported: 'contested',
        supportReason: 'la fonte parla di citazioni controllabili al momento della lettura, un’altra dice che il collegamento resta ma il contenuto no',
        judge: 'un secondo modello',
        judgedAt: '2026-09-11T20:41:30.000Z',
        opposing: [{
          url: 'https://arxiv.org/abs/2508.01234',
          title: 'Link rot and quote drift in retrieval-augmented reports',
          passage: 'A live URL is not evidence: in our sample, 17% of cited pages no longer contained the sentence the report attributed to them after six months.',
          span: { from: 410, to: 552 },
        }],
      },
    },
    {
      text: 'Tutti i prodotti della categoria dichiarano prima quanto costerà la ricerca.',
      sourceIndex: 4,
      passage: '',
      checks: { resolved: 'snippet', quotePresent: false, quoteSpan: null, claimSupported: 'no', supportReason: 'nel testo raccolto non c’è nessuna dichiarazione di costo preventiva', judge: 'un secondo modello', judgedAt: '2026-09-11T20:41:44.000Z' },
    },
    {
      text: 'Il numero di fonti dichiarato corrisponde al numero di prove indipendenti.',
      sourceIndex: 5,
      passage: 'Reports include connections to relevant websites and organizations.',
      checks: { resolved: 'page', quotePresent: true, quoteSpan: { from: 3010, to: 3076 }, claimSupported: 'unchecked', supportReason: 'nessun giudice disponibile al momento della verifica di questa affermazione', judge: null, judgedAt: null },
    },
  ],
  sources: [
    { url: 'https://blog.google/products/gemini/google-gemini-deep-research/', title: 'Try Deep Research and our new experimental model in Gemini', publishedAt: '2024-12-11', obtained: 'page' },
    { url: 'https://blog.google/technology/google-deepmind/gemini-agent-2026/', title: 'Agenti e strumenti: cosa cambia nel 2026', publishedAt: '2026-03-04', obtained: 'page' },
    { url: 'https://claude.com/blog/research', title: 'Claude takes research to new places', publishedAt: '2025-04-15', obtained: 'page' },
    { url: 'https://www.w3.org/WAI/ARIA/apg/patterns/tabs/', title: 'Tabs Pattern — ARIA Authoring Practices Guide', publishedAt: null, obtained: 'snippet' },
    { url: 'https://arxiv.org/abs/2504.09876', title: 'Evidence provenance in agentic research systems', publishedAt: '2025-04-20', obtained: 'page' },
    { url: 'https://arxiv.org/abs/2508.01234', title: 'Link rot and quote drift in retrieval-augmented reports', publishedAt: '2025-08-02', obtained: 'page' },
  ],
};

/** Un rapporto SENZA record: prosa e basta. Serve a provare che il bilancio non si inventa. */
const RAPPORTO_SENZA_RECORD = `# Formati dei documenti e conservazione delle fonti

Tre formati coprono il 95% di quello che la gente scambia: Markdown per il testo, JSON per i dati,
PDF per ciò che deve restare com'è. La conservazione delle fonti è il punto debole di tutti e tre:
nessuno dei formati porta con sé il testo da cui una frase viene.

## Cosa resta aperto

Chi conserva solo l'indirizzo di una fonte non può più, sei mesi dopo, dire se quella pagina diceva
davvero quella cosa.
`;

/** La Libreria finta: id della voce → byte del file, come li manderebbe la rotta `/library/:id/file`. */
export const RAPPORTI = new Map([
  ['lib-rapporto-pieno', documentoRapporto(RECORD_PIENO)],
  ['lib-rapporto-senza-record', RAPPORTO_SENZA_RECORD],
  ['lib-rapporto-illeggibile', '# Ricerca interrotta\n\nIl testo si ferma qui.\n\n```talos-research-report\n{"version":1,"claims":[{"text":"tronc'],
  /* ⛔ 11/09 — LA RICERCA VERA `d2a453a8`: il file in Libreria c'è, ed è la scusa da 290 byte. Il
     cancello di consegna l'ha respinta (stato `senza-rapporto`), quindi non è un rapporto: serve a
     provare che il pannello NON la stampa come tale. */
  ['lib-scusa-290', SCUSA_290],
]);

export const RICERCHE = [
  {
    id: 'ric-viva',
    domanda: 'Quali interfacce di approvazione usano gli agenti che eseguono comandi sul computer di chi li usa?',
    stato: 'running',
    avviataAlle: '2026-09-11T20:31:00.000Z',
    conclusaAlle: null,
    reportLibraryId: null,
    motivo: null,
    padreId: 'sessione-madre',
    nome: 'Approvazioni negli agenti desktop',
    ultimoMessaggio: 'Ho letto quattro pagine; sto cercando le linee guida ufficiali sulle conferme distruttive.',
  },
  {
    id: 'ric-conclusa',
    domanda: DOMANDA_LUNGA,
    stato: 'done',
    avviataAlle: '2026-09-11T18:56:46.041Z',
    conclusaAlle: '2026-09-11T19:00:58.000Z',
    reportLibraryId: 'lib-rapporto-pieno',
    motivo: null,
    padreId: 'sessione-madre',
    nome: 'Harness agentici desktop 2026',
    ultimoMessaggio: 'Il rapporto è depositato: cinque affermazioni, sei fonti, una contesa.',
  },
  {
    /* ⛔ LA RICERCA VERA DELL'11/09. Col cancello di consegna non è più «Conclusa»: non ha
       depositato niente, e la scusa resta dov'è — un allegato, non un rapporto. */
    id: 'ric-bloccata',
    domanda: 'Come stanno evolvendo gli harness agentici desktop nel 2026 e quali capacità li separano?',
    stato: 'bloccata-dal-permesso',
    avviataAlle: '2026-09-11T18:56:46.041Z',
    conclusaAlle: '2026-09-11T19:00:33.549Z',
    reportLibraryId: null,
    motivo: 'La sessione era aperta in sola lettura: la ricerca non ha potuto depositare il suo rapporto.',
    padreId: 'sessione-madre',
    nome: 'Harness agentici desktop (primo tentativo)',
    ultimoMessaggio: SCUSA_290,
  },
  {
    id: 'ric-senza-record',
    domanda: 'Formati dei documenti e conservazione delle fonti',
    stato: 'done',
    avviataAlle: '2026-09-10T16:00:00.000Z',
    conclusaAlle: '2026-09-10T16:19:40.000Z',
    reportLibraryId: 'lib-rapporto-senza-record',
    motivo: null,
    padreId: null,
    nome: 'Formati e fonti',
    ultimoMessaggio: 'Ho scritto il rapporto in Libreria.',
  },
  {
    id: 'ric-in-pausa',
    domanda: 'Confronto dettagliato delle autorizzazioni e del recupero dopo una ricerca interrotta per indisponibilità del servizio',
    stato: 'paused',
    avviataAlle: '2026-09-11T16:42:00.000Z',
    conclusaAlle: null,
    reportLibraryId: null,
    motivo: 'Messa in pausa dalla chat dopo la seconda linea di indagine.',
    padreId: null,
    nome: 'Autorizzazioni e recupero',
    ultimoMessaggio: 'Mi fermo qui: riprendo dalla terza linea quando vuoi.',
  },
  {
    id: 'ric-giri',
    domanda: 'Quanto costa, in token, una ricerca approfondita su un corpus di trenta documenti interni?',
    stato: 'giri-esauriti',
    avviataAlle: '2026-09-09T09:12:00.000Z',
    conclusaAlle: '2026-09-09T09:31:22.000Z',
    reportLibraryId: null,
    motivo: 'Ha usato tutti i giri a disposizione prima di arrivare a una sintesi.',
    padreId: null,
    nome: 'Costo di una ricerca su corpus interno',
    ultimoMessaggio: 'Sto ancora raccogliendo: mi mancano i documenti dal sedicesimo in poi.',
  },
  {
    /*
     * ⛔⛔ LA RICERCA VERA `d2a453a8`, foto dell'owner sul 4174 dell'11/09: stato `senza-rapporto`
     *   E un `reportLibraryId` vero, perché il file in Libreria esiste — sono i 290 byte di scusa
     *   del modello. È il caso che faceva dire alla sezione «Col rapporto» nei filtri e nel piede
     *   della scheda, e al pannello «Rapporto» di stampare la scusa come se fosse il rapporto.
     *   Sta qui perché senza di lui NESSUNA fixture aveva le due cose insieme: `ric-bloccata` ha
     *   la scusa come ultimo messaggio, ma `reportLibraryId: null`.
     */
    id: 'ric-scusa',
    domanda: 'Quali capacità separano gli harness agentici desktop nel 2026?',
    stato: 'senza-rapporto',
    avviataAlle: '2026-09-11T18:56:46.041Z',
    conclusaAlle: '2026-09-11T19:00:33.549Z',
    reportLibraryId: 'lib-scusa-290',
    motivo: 'Il documento consegnato non è un rapporto: la consegna l’ha respinto.',
    padreId: 'sessione-madre',
    nome: 'Harness agentici desktop 2026',
    /* ⛔ DIVERSO dal file depositato, di proposito: sono due cose diverse — il file sta in
       Libreria, l'ultimo messaggio è quello che la ricerca ha detto in chat. Con lo stesso testo
       in tutti e due i posti la schermata sembrava ripetersi (visto nella foto), e la prova non
       avrebbe mostrato che il pannello li tiene separati. */
    ultimoMessaggio: 'Ho lasciato quello che avevo in un file: dimmi se vuoi che riprovi a scrivere il rapporto vero.',
  },
  {
    id: 'ric-senza-rapporto',
    domanda: 'Organizzazione dei rapporti dentro un progetto: una cartella per ricerca o un archivio unico?',
    stato: 'senza-rapporto',
    avviataAlle: '2026-09-08T15:00:00.000Z',
    conclusaAlle: '2026-09-08T15:26:10.000Z',
    reportLibraryId: null,
    motivo: 'È arrivata in fondo, ma non ha depositato nessun rapporto.',
    padreId: null,
    nome: 'Organizzazione dei rapporti',
    ultimoMessaggio: 'Ecco un riassunto a voce di quello che ho trovato.',
  },
  {
    id: 'ric-annullata',
    domanda: 'Verifica della disponibilità dei servizi di ricerca sul piano gratuito',
    stato: 'cancelled',
    avviataAlle: '2026-09-07T14:00:00.000Z',
    conclusaAlle: '2026-09-07T14:02:41.000Z',
    reportLibraryId: null,
    motivo: 'Fermata a mano dopo due minuti.',
    padreId: null,
    nome: 'Disponibilità dei servizi',
    ultimoMessaggio: null,
  },
  {
    id: 'ric-fallita',
    domanda: 'Quali licenze permettono di ridistribuire i modelli scaricati da un catalogo pubblico?',
    stato: 'failed',
    avviataAlle: '2026-09-06T11:30:00.000Z',
    conclusaAlle: '2026-09-06T11:31:05.000Z',
    reportLibraryId: null,
    motivo: 'Il motore di ricerca ha risposto «troppe richieste» per tre volte di fila.',
    padreId: null,
    nome: 'Licenze dei modelli pubblici',
    ultimoMessaggio: null,
  },
  {
    id: 'ric-rotta',
    domanda: 'Ricerca con un rapporto che non si rilegge',
    stato: 'done',
    avviataAlle: '2026-09-05T10:00:00.000Z',
    conclusaAlle: '2026-09-05T10:14:00.000Z',
    reportLibraryId: 'lib-rapporto-illeggibile',
    motivo: null,
    padreId: null,
    nome: 'Rapporto troncato',
    ultimoMessaggio: 'Ho salvato il rapporto.',
  },
];

/** La lettura del file di Libreria, come la farà `legacy/app.js` con `/library/:voceId/file`. */
export function leggiRapportoFinto(voce) {
  const testo = RAPPORTI.get(voce?.reportLibraryId);
  if (testo === undefined) return Promise.reject(new Error('la voce di Libreria non esiste più'));
  return Promise.resolve(testo);
}

/*
 * ⛔ IL MENU DEL LABORATORIO — e cosa NON prova.
 *   Nel prodotto il menu lo disegna `apriMenuAzioniLibreria` (`legacy/app.js:13295`), che qui non
 *   gira: il monolite non è caricato. Questo è lo stesso MARKUP (`.ft-actions-menu`,
 *   `role="menu"`, `.ft-actions-menu-item`), quindi la foto mostra i colori e la forma veri del
 *   prodotto — ma la regia (clic fuori, Esc, ritorno del fuoco) è quella del monolite e da qui
 *   NON è provata. Sta scritto anche nel rapporto del lotto, sotto «non verificato».
 */
export function apriMenuDiProva(voci, dove = {}) {
  document.querySelector('.ft-actions-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'ft-actions-menu';
  menu.setAttribute('role', 'menu');
  for (const voce of voci) {
    if (voce.separaPrima && menu.childElementCount) {
      const sep = document.createElement('div');
      sep.className = 'ft-actions-menu-sep';
      sep.setAttribute('role', 'separator');
      menu.append(sep);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ft-actions-menu-item${voce.pericolo ? ' ft-actions-menu-item-danger' : ''}`;
    b.setAttribute('role', 'menuitem');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.setAttribute('class', 'i');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', `#${voce.icona || 'i-more'}`);
    svg.append(use);
    const testo = document.createElement('span');
    testo.textContent = voce.etichetta;
    b.append(svg, testo);
    b.addEventListener('click', () => { menu.remove(); voce.aziona(); });
    menu.append(b);
  }
  document.body.append(menu);
  if (dove.ancoraEl) {
    const r = dove.ancoraEl.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  } else {
    const m = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(dove.x ?? 0, window.innerWidth - m.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(dove.y ?? 0, window.innerHeight - m.height - 8))}px`;
  }
  menu.querySelector('.ft-actions-menu-item')?.focus();
  return menu;
}

/* ═══════════════════════════════════ L5, 12/09/2026 — le azioni di scrittura ═══════════════ */

/**
 * La scheda intera di una ricerca, com'è nel contratto `GET …/research/:id` (L5 §4.2).
 *
 * ⛔ `piano` e `passi` hanno i nomi VERI dei campi (`question`/`estimate`, `kind`/`state`/
 *   `attempts`/`spend`): sono quelli del typedef di `src/research/run.mjs`, non nomi comodi. Sui
 *   dati veri di oggi quelle due liste sono vuote su OGNI ricerca — la vista esiste per il giorno
 *   in cui non lo saranno, e una fixture col nome sbagliato la farebbe nascere già rotta.
 */
export const DETTAGLI_RICERCA = new Map([
  /* ⛔ VISTO NELLA FOTO (`menu_viva-light-1440`): senza questa voce la scheda di una ricerca IN
     CORSO diceva «Giornale di bordo: non ne ha uno», che per una ricerca viva è falso — era una
     lacuna della fixture, e una foto con dentro una frase falsa non prova niente. */
  ['ric-viva', {
    piano: [{ id: 'b1', question: 'Quali interfacce di approvazione usano gli agenti desktop?', estimate: { tokens: 3600, searches: 2, pages: 4 } }],
    passi: [
      { id: 's1', branchId: 'b1', kind: 'search', state: 'done', attempts: 1, spend: { tokens: 700, searches: 2, pages: 0 }, error: null },
      { id: 's2', branchId: 'b1', kind: 'read', state: 'running', attempts: 1, spend: { tokens: 1900, searches: 0, pages: 4 }, error: null },
    ],
    spesa: { tokens: 2600, searches: 2, pages: 4 },
    giornale: { eventi: 8, righeSaltate: 0, stato: 'collecting' },
  }],
  ['ric-conclusa', {
    piano: [
      { id: 'b1', question: 'Quali capacità separano gli harness desktop nel 2026?', estimate: { tokens: 4200, searches: 2, pages: 4 } },
      { id: 'b2', question: 'Chi espone il controllo del computer e con quali permessi?', estimate: { tokens: 3100, searches: 1, pages: 3 } },
    ],
    passi: [
      { id: 's1', branchId: 'b1', kind: 'search', state: 'done', attempts: 1, spend: { tokens: 1200, searches: 2, pages: 0 }, error: null },
      { id: 's2', branchId: 'b1', kind: 'read', state: 'done', attempts: 1, spend: { tokens: 3600, searches: 0, pages: 4 }, error: null },
      { id: 's3', branchId: 'b2', kind: 'read', state: 'failed', attempts: 3, spend: { tokens: 400, searches: 0, pages: 1 }, error: 'la pagina non risponde' },
      { id: 's4', branchId: 'b2', kind: 'verify', state: 'done', attempts: 1, spend: { tokens: 2900, searches: 0, pages: 0 }, error: null },
      { id: 's5', branchId: 'b2', kind: 'synthesise', state: 'done', attempts: 1, spend: { tokens: 4700, searches: 0, pages: 0 }, error: null },
    ],
    spesa: { tokens: 12800, searches: 2, pages: 5 },
    giornale: { eventi: 23, righeSaltate: 0, stato: 'done' },
  }],
  ['ric-in-pausa', {
    piano: [{ id: 'b1', question: 'Come recuperano gli agenti dopo un servizio indisponibile?', estimate: { tokens: 2800, searches: 1, pages: 3 } }],
    passi: [
      { id: 's1', branchId: 'b1', kind: 'search', state: 'done', attempts: 1, spend: { tokens: 800, searches: 1, pages: 0 }, error: null },
      { id: 's2', branchId: 'b1', kind: 'read', state: 'interrupted', attempts: 2, spend: { tokens: 0, searches: 0, pages: 0 }, error: null },
    ],
    spesa: { tokens: 3400, searches: 1, pages: 2 },
    giornale: { eventi: 11, righeSaltate: 1, stato: 'paused' },
  }],
]);

/**
 * L'esito della ri-verifica com'è OGGI sui dati veri: `misurabile: false`, nessuna fonte «intatta».
 *
 * ⛔ Non è pessimismo da fixture: `intatta`/`cambiata` non escono mai finché il collettore non
 *   tiene il testo con il suo url (rapporto L5 §3.4), e il modulo che misura, chiamato senza quella
 *   mappa, risponderebbe «intatta» su tutto. Una fixture ottimista farebbe fotografare una
 *   schermata che nessuno vedrà, e nasconderebbe proprio il caso che si deve saper disegnare.
 */
export const RIVERIFICA_DI_PROVA = {
  id: 'ric-conclusa',
  fattaAlle: '2026-09-12T09:41:00.000Z',
  misurabile: false,
  avvertenza: 'Il testo delle pagine non era stato tenuto per questa ricerca: «intatta» o «cambiata» non si possono dire. Ciò che si misura è se i passaggi citati sono ancora nella pagina di oggi.',
  fonti: [
    { url: 'https://esempio.it/uno', titolo: 'Il primo studio sugli harness desktop', stato: 'non-misurabile', sopravvissuto: null, motivoLettura: null, passaggiRitrovati: 2, passaggiPersi: 0 },
    { url: 'https://esempio.it/due', titolo: 'Permessi per attrezzo: la rassegna', stato: 'non-misurabile', sopravvissuto: null, motivoLettura: null, passaggiRitrovati: 0, passaggiPersi: 1 },
    { url: 'https://news.bbc.co.uk/tre', titolo: 'Cronaca dell’automazione desktop', stato: 'irraggiungibile', sopravvissuto: null, motivoLettura: 'unreadable', passaggiRitrovati: 0, passaggiPersi: 0 },
  ],
  bilancio: { fonti: 3, intatte: 0, cambiate: 0, irraggiungibili: 1, nonMisurabili: 2, passaggiCitati: 3, passaggiRitrovati: 2, passaggiPersi: 1 },
  troncata: false, fontiTotali: 3, testiTenuti: 0,
};

/**
 * La rete del laboratorio per le cinque rotte di L5.
 *
 * ⛔ Non è un secondo backend: è la stessa busta già aperta (`apiPost` torna `data`) e gli stessi
 *   codici d'errore del contratto, in memoria. Senza una rete la sezione — giustamente — non
 *   disegna nemmeno una voce di menu, quindi senza questo non ci sarebbe niente da fotografare.
 * ⛔ La PAUSA risponde ancora `running`, ed è voluto: il contratto §4.3 dice che il passaggio a
 *   «in pausa» avviene al punto sicuro, e la sezione non deve promettere ciò che non è ancora
 *   successo. Il laboratorio deve poter far vedere anche QUELLA frase.
 */
export function reteRicercheDiProva(elenco) {
  const parti = (pathname) => {
    const m = /^\/api\/v1\/sessions\/[^/]+\/research\/([^/]+)(?:\/(pausa|ripresa|riverifica))?$/.exec(pathname);
    if (!m) throw Object.assign(new Error('Indirizzo sconosciuto nel laboratorio'), { code: 'NOT_FOUND' });
    return { id: decodeURIComponent(m[1]), azione: m[2] || null };
  };
  const trova = (id) => {
    const voce = elenco.find((r) => String(r.id) === String(id));
    if (!voce) throw Object.assign(new Error('Non c’è più'), { code: 'RESEARCH_NOT_FOUND' });
    return voce;
  };
  const scheda = (voce) => ({ ...voce, ...(DETTAGLI_RICERCA.get(voce.id) || { piano: [], passi: [], spesa: null, giornale: null }) });
  return {
    leggi: async (pathname) => ({ ricerca: scheda(trova(parti(pathname).id)), errore: null }),
    post: async (pathname) => {
      const { id, azione } = parti(pathname);
      const voce = trova(id);
      if (azione === 'pausa') {
        if (voce.stato !== 'running') throw Object.assign(new Error('no'), { code: 'RESEARCH_CONFLICT' });
        return { ricerca: scheda(voce) }; // ⛔ ancora `running`: la pausa è una richiesta
      }
      if (azione === 'ripresa') {
        if (voce.stato !== 'paused' && voce.stato !== 'failed') throw Object.assign(new Error('no'), { code: 'RESEARCH_CONFLICT' });
        voce.stato = 'running';
        voce.motivo = null;
        return { ricerca: scheda(voce) };
      }
      if (voce.id !== 'ric-conclusa') throw Object.assign(new Error('no'), { code: 'RESEARCH_RECHECK_UNAVAILABLE' });
      return { riverifica: RIVERIFICA_DI_PROVA };
    },
    elimina: async (pathname) => {
      const { id } = parti(pathname);
      const voce = trova(id);
      elenco.splice(elenco.indexOf(voce), 1);
      return { eliminata: true, id, titolo: voce.nome };
    },
  };
}
