/*
 * R4 — ATTIVITÀ COMPATTA · il foglio del PROTOTIPO. SOLO LABORATORIO.
 *
 * ⛔ Vive in una stringa perché il build del laboratorio ha un solo foglio d'ingresso
 *   (`src/styles/main.css`) e questo NON deve entrare nel prodotto: si inietta dalla scena.
 * ⛔ Nessun colore nuovo: solo i token Calm (`--talos-*`), così chiaro e scuro vengono da soli e il
 *   linguaggio visivo resta quello della app («si cambia la STRUTTURA, non il linguaggio», regola del 04/09).
 * ⛔ `hidden="until-found"` si implementa con `content-visibility:hidden`: il box del contenitore
 *   nascosto resta, con i suoi margini, bordi e padding (MDN, «hidden», letto il 23/09/2026). Per questo
 *   i contenitori nascosti (`__corpo`, `__dettaglio`) non hanno MAI padding o bordi: stanno sul figlio.
 *   E non devono mai essere `display:none|contents|inline`, o la ricerca nella pagina non li apre.
 */
export const STILE_ATTIVITA_COMPATTA = `
.talos-segmento{
  --seg-testa:30px; --seg-riga:28px;
  container-type:inline-size;
  margin:4px 0; border:1px solid var(--talos-border-subtle); border-radius:10px;
  background:var(--talos-card-subtle); color:var(--talos-assistant-text);
}
.talos-message > .talos-segmento + .talos-message__copy,
.talos-message > .talos-message__copy + .talos-segmento{ margin-top:16px }
.talos-message > .talos-segmento + .talos-segmento{ margin-top:4px }

/* ---------------------------------------------------------------- la riga del segmento */
.talos-segmento__testa{ display:flex; align-items:center; gap:2px; padding-right:2px }
.talos-segmento__riassunto{
  flex:1; min-width:0; display:flex; align-items:center; gap:8px;
  height:var(--seg-testa); padding:0 8px 0 10px; border:0; border-radius:9px;
  background:transparent; color:inherit; font:inherit; font-size:13px; line-height:18px; text-align:left; cursor:pointer;
}
.talos-segmento__riassunto:hover{ background:var(--talos-card-hover, var(--talos-card-subtle)) }
.talos-segmento__chev{ width:14px; height:14px; flex:none; color:var(--talos-muted);
  transition:transform var(--talos-motion-duration-control, 160ms) var(--talos-motion-ease, ease) }
.talos-segmento__riassunto[aria-expanded="true"] .talos-segmento__chev{ transform:rotate(180deg) }
.talos-segmento__stato{ flex:none; display:inline-grid; place-items:center; width:10px }
.talos-segmento__stato:empty{ display:none }
.talos-segmento__conteggi{ flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.talos-segmento__adesso{ color:var(--talos-text); font-weight:600 }
.talos-segmento__bersagli{ flex:1 1 0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  color:var(--talos-muted); font-family:var(--talos-font-mono); font-size:11.5px }
.talos-segmento__misure{ flex:none; display:flex; align-items:center; gap:10px; color:var(--talos-muted);
  font-size:12px; font-variant-numeric:tabular-nums }
.talos-segmento__tempo{ min-width:4.5ch; text-align:right }
.talos-segmento__errore{ display:inline-flex; align-items:center; gap:4px; color:var(--talos-danger); font-weight:600 }
.talos-segmento__errore .i{ width:13px; height:13px }
.talos-segmento__piu{ color:var(--talos-success) } .talos-segmento__meno{ color:var(--talos-danger) }
.talos-segmento__altro{ flex:none; width:28px; height:28px; display:grid; place-items:center; border:0; border-radius:8px;
  background:transparent; color:var(--talos-muted); cursor:pointer; opacity:0 }
.talos-segmento__altro .i{ width:16px; height:16px }
.talos-segmento:hover .talos-segmento__altro, .talos-segmento:focus-within .talos-segmento__altro,
.talos-segmento__altro[aria-expanded="true"]{ opacity:1 }
.talos-segmento__altro:hover{ background:var(--talos-card-hover, var(--talos-card-subtle)); color:var(--talos-text) }

/* Una voce sola: niente testa e niente scheda, come «.talos-activity--nuda» del prodotto (diff-in-chat.css:113). */
.talos-segmento--nudo{ border-color:transparent; background:transparent }
.talos-segmento--nudo .talos-segmento__interno{ padding:0 }
.talos-segmento--nudo .talos-segmento__voci::before{ display:none }

/* ---------------------------------------------------------------- errori fissati, visibili a segmento chiuso */
.talos-segmento__fissate{ padding:0 4px 4px }
.talos-segmento__fissate[hidden]{ display:none }

/* ---------------------------------------------------------------- il corpo (senza padding: vedi testata) */
.talos-segmento__interno{ border-top:1px solid var(--talos-border-subtle); padding:4px 4px 6px }
.talos-segmento__filtri{ display:flex; flex-wrap:wrap; gap:4px; padding:2px 4px 6px }
.talos-filtro{ height:24px; padding:0 9px; border-radius:999px; border:1px solid var(--talos-border-subtle);
  background:transparent; color:var(--talos-muted); font:inherit; font-size:12px; cursor:pointer; font-variant-numeric:tabular-nums }
.talos-filtro:hover{ color:var(--talos-text) }
.talos-filtro[aria-pressed="true"]{ background:var(--talos-accent-soft); color:var(--talos-accent-text, var(--talos-text)); border-color:var(--talos-accent-border) }
.talos-segmento__nota{ padding:2px 10px 4px; color:var(--talos-muted); font-size:12px }
.talos-segmento__nota[hidden]{ display:none }

/* ---------------------------------------------------------------- le voci: una riga ciascuna, in ordine */
.talos-segmento__voci{ list-style:none; margin:0; padding:0; position:relative }
.talos-segmento__voci::before{ content:''; position:absolute; left:17.5px; top:14px; bottom:14px; width:1px;
  background:var(--talos-border-subtle) }
.talos-voce[hidden]{ display:none }
.talos-voce__riga{
  position:relative; display:flex; align-items:center; gap:8px; width:100%; height:var(--seg-riga);
  padding:0 8px 0 10px; border:0; border-radius:7px; background:transparent; color:inherit;
  font:inherit; font-size:13px; line-height:18px; text-align:left; cursor:pointer;
}
.talos-voce__riga:hover{ background:var(--talos-card-hover, var(--talos-card-subtle)) }
.talos-voce__icona{ position:relative; width:16px; height:16px; flex:none; display:grid; place-items:center;
  color:var(--talos-muted); background:var(--talos-card); border-radius:4px; box-shadow:0 0 0 2px var(--talos-card) }
.talos-voce__icona .i{ width:14px; height:14px }
.talos-voce__verbo{ flex:none; white-space:nowrap }
.talos-voce__oggetto{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--talos-muted);
  font-family:var(--talos-font-mono); font-size:11.5px }
.talos-voce[data-tipo="ragionamento"] .talos-voce__oggetto{ font-family:inherit; font-size:12.5px }
/* Aperto, il ragionamento mostra il suo testo: il titolo nella riga lo ripeterebbe (visto nella foto S2). */
.talos-voce[data-tipo="ragionamento"] > .talos-voce__riga[aria-expanded="true"] .talos-voce__oggetto{ visibility:hidden }
.talos-voce__meta{ flex:none; color:var(--talos-muted); font-size:11.5px; font-variant-numeric:tabular-nums; white-space:nowrap }
.talos-voce__meta .talos-segmento__piu, .talos-voce__meta .talos-segmento__meno{ font-family:var(--talos-font-mono) }
.talos-voce[data-stato="fallito"] .talos-voce__icona{ color:var(--talos-danger) }
.talos-voce[data-stato="fallito"] .talos-voce__meta{ color:var(--talos-danger); font-weight:600 }
.talos-voce[data-stato="in-corso"] .talos-voce__verbo{ color:var(--talos-text); font-weight:600 }
.talos-voce__pallino{ flex:none }

.talos-voce__interno{ margin:2px 6px 6px 34px; padding:8px 10px; border-radius:8px; background:var(--talos-panel-soft);
  border:1px solid var(--talos-border-subtle); color:var(--talos-muted); font-family:var(--talos-font-mono); font-size:11.5px;
  line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; max-height:240px; overflow:auto }
.talos-voce__interno h4{ margin:0 0 2px; font:600 11px/1.4 var(--talos-font-mono); color:var(--talos-text) }
.talos-voce__interno h4 + pre{ margin:0 0 8px }
.talos-voce__interno pre{ margin:0; white-space:pre-wrap; font:inherit; color:var(--talos-assistant-text) }
.talos-voce[data-tipo="ragionamento"] .talos-voce__interno{ font-family:inherit; font-size:13px; line-height:1.55;
  white-space:normal; color:var(--talos-assistant-text); max-height:none }
.talos-voce[data-tipo="ragionamento"] .talos-voce__interno > :first-child{ margin-top:0 }
.talos-voce[data-tipo="ragionamento"] .talos-voce__interno > :last-child{ margin-bottom:0 }

/* ---------------------------------------------------------------- tastiera: il fuoco si vede sempre */
.talos-segmento button:focus-visible{ outline:2px solid var(--talos-accent); outline-offset:-2px }

/* ---------------------------------------------------------------- la variante «riga quieta» (domanda all'owner) */
.talos-segmento[data-variante="quieta"]{ border-color:transparent; background:transparent }
.talos-segmento[data-variante="quieta"]:hover, .talos-segmento[data-variante="quieta"]:focus-within,
.talos-segmento[data-variante="quieta"][data-aperto="si"]{ border-color:var(--talos-border-subtle); background:var(--talos-card-subtle) }
.talos-segmento[data-variante="quieta"] .talos-segmento__conteggi{ color:var(--talos-muted) }

/* ---------------------------------------------------------------- colonna stretta: prima cedono i bersagli */
@container (max-width: 520px){ .talos-segmento__bersagli{ display:none } }
@container (max-width: 360px){ .talos-segmento__tempo{ display:none } .talos-voce__oggetto{ display:none } }

/* ---------------------------------------------------------------- movimento ridotto: SOLO qui dentro */
@media (prefers-reduced-motion: reduce){
  .talos-segmento__chev{ transition:none }
  .talos-segmento .talos-dot--live{ animation:none }
}

/* ---------------------------------------------------------------- la banda del laboratorio */
.r4a-banda{ display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0 0 14px; padding:8px 10px;
  border:1px dashed var(--talos-border); border-radius:10px; color:var(--talos-muted); font-size:12px }
.r4a-banda strong{ color:var(--talos-text); font-weight:600; margin-right:4px }
.r4a-banda .talos-filtro[aria-current="page"]{ background:var(--talos-accent-soft); color:var(--talos-accent-text, var(--talos-text)); border-color:var(--talos-accent-border) }
.r4a-banda__spazio{ flex:1 }
`;
