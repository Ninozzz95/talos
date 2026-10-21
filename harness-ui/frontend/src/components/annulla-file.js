/*
 * R5.11 «Annulla le modifiche ai file» dal PC (owner 18/10/2026: «Come Hermes, PC e telefono»; mockup approvato la sera stessa,
 * `jobs/0311825f/tmp/mockup-annulla-*`). Il server fa il lavoro (`src/punti-di-ripristino.mjs`); qui c'è la finestra:
 *   · la voce «Annulla le modifiche ai file da qui» sta nel «⋯» del messaggio della persona (legacy/app.js);
 *   · l'anteprima dice che cosa torna com'era e che cosa resta com'è, col motivo, e la persona può includere a mano un file saltato;
 *   · a destra il diff del file scelto, coi pezzi della chat (`creaDiffInChat`) e il lettore del diff della scheda Git;
 *   · l'esito è un toast con «Rifai».
 * ⛔ Pezzi esistenti, nessuna veste nuova: la modale è `apriModale`, gruppi e righe sono quelli della scheda Git
 *   (`talos-github-gruppo`, `talos-github-riga` con la lettera M/A/D), la casella è `talos-checkbox`, il toast è quello di sempre.
 */
import { t, tn } from './lingua.js';
import { apriModale, chiudiModale } from './modale-td.js';
import { creaDiffInChat } from './conversazione.js';
import { analizzaDiffUnificato } from './scheda-github.js';
import { azioneAnnulla } from './toast.js';

/**
 * Il punto da cui annullare per un messaggio della persona: il primo punto il cui turno è partito a quel messaggio o dopo
 * (`seqAvvio` è la sequenza del RunStarted del turno, la stessa del riferimento `giro:<sequenza>` del messaggio a schermo).
 */
export function pianoDalMessaggio(punti, sequenza) {
  if (!Array.isArray(punti) || !Number.isSafeInteger(sequenza)) return null;
  return punti
    .filter((p) => Number.isSafeInteger(p?.seqAvvio) && p.seqAvvio >= sequenza && Number.isSafeInteger(p.turno))
    .sort((a, b) => a.seqAvvio - b.seqAvvio)[0] ?? null;
}

/** Il diff unificato di più file, diviso per percorso (dal `+++ b/…`, o dal `--- a/…` per un file cancellato). */
export function diffPerFile(testo) {
  const fuori = new Map();
  const blocchi = String(testo ?? '').split(/^(?=diff --git )/mu).filter((b) => b.startsWith('diff --git '));
  for (const blocco of blocchi) {
    const dopo = /^\+\+\+ (?:b\/)?(.*)$/mu.exec(blocco)?.[1]?.replace(/\t$/u, '');
    const prima = /^--- (?:a\/)?(.*)$/mu.exec(blocco)?.[1]?.replace(/\t$/u, '');
    const percorso = dopo && dopo !== '/dev/null' ? dopo : prima && prima !== '/dev/null' ? prima : null;
    if (percorso) fuori.set(percorso, blocco);
  }
  return fuori;
}

/** «oggi alle 14:32» / «ieri alle 9:05» / la data, nella lingua dell'interfaccia. */
export function quandoDetto(iso, adesso = new Date()) {
  const d = new Date(iso ?? '');
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const ieri = new Date(adesso); ieri.setDate(ieri.getDate() - 1);
  if (d.toDateString() === adesso.toDateString()) return t('annulla.when.today', { time });
  if (d.toDateString() === ieri.toDateString()) return t('annulla.when.yesterday', { time });
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const MOTIVI_NOTI = Object.freeze({ 'git-assente': 'gitAssente', 'git-vecchio': 'gitVecchio', 'cartella-troppo-larga': 'cartellaTroppoLarga', 'troppi-file': 'troppiFile' });
const motivoDetto = (m) => t(`annulla.reason.${MOTIVI_NOTI[m] ?? 'other'}`);

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined) n.textContent = testo;
  return n;
}

/**
 * R5.11, seconda porta (owner 18/10/2026: «sì, con la carta di conferma»): il blocco della carta che il modello apre con
 * `file_changes_undo`. Gli stessi gruppi e righe della finestra, senza caselle (i file da includere li ha già scelti il modello su
 * tua richiesta, e la carta li segna), e il diff di ogni file in un `<details>` chiuso.
 */
export function creaBloccoCartaAnnulla(doc, azione) {
  const blocco = nodo(doc, 'div', 'talos-github talos-annulla-carta');
  blocco.dataset.annullaCarta = '';
  const inclusi = new Set(Array.isArray(azione?.inclusi) ? azione.inclusi : []);
  const tornano = [...(azione?.ripristina ?? []), ...(azione?.salta ?? []).filter((s) => inclusi.has(s.percorso))];
  const restano = (azione?.salta ?? []).filter((s) => !inclusi.has(s.percorso));
  const diffs = diffPerFile(azione?.diff);
  const riga = (voce, motivo) => {
    const li = nodo(doc, 'li', 'talos-github-riga');
    li.dataset.percorso = voce.percorso;
    const parti = String(voce.percorso).split('/');
    const nome = parti.pop();
    const lettera = nodo(doc, 'span', `talos-github-riga__lettera talos-github-riga__lettera--${voce.stato}`, voce.stato);
    lettera.title = t(`annulla.status.${voce.stato}`);
    const testa = nodo(doc, 'div', 'talos-github-riga__apri talos-annulla-carta__riga');
    testa.append(lettera, nodo(doc, 'span', 'talos-github-riga__nome', nome), nodo(doc, 'span', 'talos-github-riga__cartella', motivo ?? parti.join('/')));
    li.append(testa);
    const testo = diffs.get(voce.percorso);
    if (testo) {
      const blocchetto = creaDiffInChat(analizzaDiffUnificato(testo), { percorso: nome, apertoSeSotto: 0, document: doc });
      const sommario = blocchetto?.querySelector('summary');
      if (sommario) sommario.textContent = t('annulla.card.diffOf', { name: nome });
      if (blocchetto) li.append(blocchetto);
    }
    return li;
  };
  const gruppo = (titolo, voci, motivoDi) => {
    const g = nodo(doc, 'section', 'talos-github-gruppo');
    const testa = nodo(doc, 'div', 'talos-github-gruppo__testa');
    testa.append(nodo(doc, 'span', 'talos-github-gruppo__titolo', titolo), nodo(doc, 'span', 'talos-github-gruppo__conto', String(voci.length)));
    const ul = nodo(doc, 'ul', 'talos-github-gruppo__righe');
    for (const v of voci) ul.append(riga(v, motivoDi(v)));
    g.append(testa, ul);
    return g;
  };
  if (tornano.length) blocco.append(gruppo(t('annulla.group.back'), tornano, (v) => (inclusi.has(v.percorso) ? t('annulla.card.included') : null)));
  if (restano.length) blocco.append(gruppo(t('annulla.group.left'), restano, (v) => t(v.motivo === 'persona' ? 'annulla.reason.person' : 'annulla.reason.command')));
  const fuori = azione?.fuori?.length ?? 0;
  if (fuori) blocco.append(nodo(doc, 'p', 'talos-inspector__hint', tn('annulla.outsideOne', 'annulla.outsideMany', fuori, { n: fuori })));
  if (azione?.troncato) blocco.append(nodo(doc, 'p', 'talos-inspector__hint', t('annulla.diffCut')));
  return blocco;
}

/** I testi della carta: quanti file tornano (compresi quelli inclusi su richiesta). */
export function testiCartaAnnulla(azione) {
  const inclusi = new Set(Array.isArray(azione?.inclusi) ? azione.inclusi : []);
  const n = (azione?.ripristina?.length ?? 0) + (azione?.salta ?? []).filter((s) => inclusi.has(s.percorso)).length;
  return {
    badge: t('annulla.card.badge'),
    bersaglio: n === 1 ? t('annulla.confirmOne') : t('annulla.confirmMany', { n }),
    perche: t('annulla.card.why'),
    motivo: '',
    nota: t('annulla.note'),
  };
}

/**
 * @param {{api:{punti:Function, anteprima:Function, annulla:Function, rifai:Function}, toast:Function, document?:Document}} deps
 *   `api.*` lanciano un Error col messaggio da dire; `toast(titolo, messaggio, opzioni)` è quello dell'app.
 */
export function creaAnnullaFile({ api, toast, document: doc = globalThis.document } = {}) {
  async function rifai() {
    try {
      const r = await api.rifai();
      const n = r?.rifatti?.length ?? 0;
      const corpo = tn('annulla.redone.bodyOne', 'annulla.redone.bodyMany', n, { n });
      const saltati = r?.saltati?.length ? ` ${t('annulla.redone.skipped', { paths: r.saltati.join(', ') })}` : '';
      toast(t('annulla.redone.title'), corpo + saltati);
    } catch (e) {
      toast(t('annulla.title'), t('annulla.failed', { reason: e?.message ?? String(e) }), { tono: 'guasto' });
    }
  }

  function disegna(piano, { testoMessaggio, alle }) {
    const inclusi = new Set();
    const diffs = diffPerFile(piano.diff);
    let scelto = piano.ripristina[0]?.percorso ?? piano.salta[0]?.percorso ?? null;

    const lead = nodo(doc, 'p', 'td-subtle talos-annulla__lead', t('annulla.lead', { message: testoMessaggio, when: quandoDetto(alle) }));
    const griglia = nodo(doc, 'div', 'talos-github talos-annulla');
    const sinistra = nodo(doc, 'div', 'talos-annulla__elenco');
    const destra = nodo(doc, 'div', 'talos-annulla__diff');
    destra.setAttribute('aria-live', 'polite');
    griglia.append(sinistra, destra);

    const piede = nodo(doc, 'div', 'td-detail-footer talos-annulla__piede');
    const nota = nodo(doc, 'span', 'td-subtle talos-annulla__nota', t('annulla.note'));
    const chiudi = nodo(doc, 'button', 'talos-button talos-button--secondary', t('annulla.close'));
    chiudi.type = 'button';
    chiudi.addEventListener('click', () => chiudiModale());
    const conferma = nodo(doc, 'button', 'talos-button talos-button--primary');
    conferma.type = 'button';
    conferma.dataset.annullaConferma = '';
    piede.append(nota, chiudi, conferma);

    const quanti = () => piano.ripristina.length + inclusi.size;
    function aggiornaConferma() {
      const n = quanti();
      conferma.textContent = n === 1 ? t('annulla.confirmOne') : t('annulla.confirmMany', { n });
      conferma.disabled = n === 0;
      nota.textContent = n === 0 ? t('annulla.nothing') : t('annulla.note');
    }

    function riga(voce, { saltata }) {
      const li = nodo(doc, 'li', 'talos-github-riga');
      li.dataset.percorso = voce.percorso;
      li.dataset.stato = voce.stato;
      const apri = nodo(doc, 'button', 'talos-github-riga__apri');
      apri.type = 'button';
      const parti = voce.percorso.split('/');
      const nome = parti.pop();
      const lettera = nodo(doc, 'span', `talos-github-riga__lettera talos-github-riga__lettera--${voce.stato}`, voce.stato);
      lettera.title = t(`annulla.status.${voce.stato}`);
      const motivo = saltata ? t(voce.motivo === 'persona' ? 'annulla.reason.person' : 'annulla.reason.command') : parti.join('/');
      apri.append(lettera, nodo(doc, 'span', 'talos-github-riga__nome', nome), nodo(doc, 'span', 'talos-github-riga__cartella', motivo));
      apri.title = voce.percorso;
      apri.setAttribute('aria-pressed', String(scelto === voce.percorso));
      apri.addEventListener('click', () => { scelto = voce.percorso; ridisegna(); });
      li.append(apri);
      if (saltata) {
        const casella = nodo(doc, 'button', 'talos-checkbox');
        casella.type = 'button';
        casella.setAttribute('role', 'checkbox');
        casella.setAttribute('aria-checked', String(inclusi.has(voce.percorso)));
        casella.setAttribute('aria-label', t('annulla.includeLabel', { path: voce.percorso }));
        casella.dataset.annullaIncludi = voce.percorso;
        casella.addEventListener('click', () => {
          if (inclusi.has(voce.percorso)) inclusi.delete(voce.percorso); else inclusi.add(voce.percorso);
          casella.setAttribute('aria-checked', String(inclusi.has(voce.percorso)));
          aggiornaConferma();
        });
        const etichetta = nodo(doc, 'label', 'td-subtle talos-annulla__includi');
        etichetta.append(casella, doc.createTextNode(t('annulla.include')));
        li.append(etichetta);
      }
      return li;
    }

    function gruppo(titolo, voci, opzioni) {
      const g = nodo(doc, 'section', 'talos-github-gruppo');
      const testa = nodo(doc, 'div', 'talos-github-gruppo__testa');
      testa.append(nodo(doc, 'span', 'talos-github-gruppo__titolo', titolo), nodo(doc, 'span', 'talos-github-gruppo__conto', String(voci.length)));
      const ul = nodo(doc, 'ul', 'talos-github-gruppo__righe');
      for (const v of voci) ul.append(riga(v, opzioni));
      g.append(testa, ul);
      return g;
    }

    function ridisegna() {
      sinistra.replaceChildren();
      if (piano.ripristina.length) sinistra.append(gruppo(t('annulla.group.back'), piano.ripristina, { saltata: false }));
      if (piano.salta.length) sinistra.append(gruppo(t('annulla.group.left'), piano.salta, { saltata: true }));
      const fuori = piano.fuori?.length ?? 0;
      if (fuori) sinistra.append(nodo(doc, 'p', 'talos-inspector__hint', tn('annulla.outsideOne', 'annulla.outsideMany', fuori, { n: fuori })));
      if (piano.troppoGrandi?.length) sinistra.append(nodo(doc, 'p', 'talos-inspector__hint', t('annulla.tooLarge', { paths: piano.troppoGrandi.join(', ') })));
      destra.replaceChildren();
      if (!scelto) return;
      const nome = scelto.split('/').pop();
      const gruppi = analizzaDiffUnificato(diffs.get(scelto) ?? '');
      const blocco = creaDiffInChat(gruppi, { percorso: nome, apertoSeSotto: Infinity, document: doc });
      if (blocco) {
        const sommario = blocco.querySelector('summary');
        if (sommario) sommario.textContent = t('annulla.diffTitle', { name: nome });
        destra.append(blocco);
      } else destra.append(nodo(doc, 'p', 'talos-inspector__hint', t('annulla.diffNone')));
      if (piano.troncato) destra.append(nodo(doc, 'p', 'talos-inspector__hint', t('annulla.diffCut')));
    }

    conferma.addEventListener('click', async () => {
      conferma.disabled = true;
      try {
        const r = await api.annulla(piano.turno, [...inclusi]);
        chiudiModale();
        const n = r?.ripristinati?.length ?? 0;
        toast(t('annulla.done.title'), tn('annulla.done.bodyOne', 'annulla.done.bodyMany', n, { n }),
          azioneAnnulla(() => { void rifai(); }, { etichetta: t('annulla.done.redo') }));
      } catch (e) {
        nota.textContent = t('annulla.failed', { reason: e?.message ?? String(e) });
        conferma.disabled = false;
      }
    });

    ridisegna();
    aggiornaConferma();
    return { contenuto: [lead, griglia, piede], conferma };
  }

  return {
    rifai,
    /** Dal «⋯» del messaggio della persona: `sequenza` è quella del suo `giro:<sequenza>`. */
    async apri({ sequenza, testoMessaggio = '' } = {}) {
      const breve = String(testoMessaggio).replace(/\s+/gu, ' ').trim();
      const citato = breve.length > 48 ? `${breve.slice(0, 48)}…` : breve;
      let punti;
      try { punti = (await api.punti())?.punti ?? []; } catch (e) {
        toast(t('annulla.title'), t('annulla.failed', { reason: e?.message ?? String(e) }), { tono: 'guasto' });
        return null;
      }
      const punto = pianoDalMessaggio(punti, sequenza);
      if (!punto) { toast(t('annulla.title'), t('annulla.noPoint')); return null; }
      if (!punto.annullabile) { toast(t('annulla.title'), t('annulla.failed', { reason: motivoDetto(punto.motivo) }), { tono: 'avviso' }); return null; }
      const attesa = nodo(doc, 'p', 'td-subtle', t('annulla.loading'));
      const aperta = apriModale(t('annulla.title'), [attesa], { document: doc, ampia: true });
      aperta?.dialogo?.setAttribute('data-annulla-file', '');
      let piano;
      try { piano = await api.anteprima(punto.turno); } catch (e) {
        attesa.textContent = t('annulla.failed', { reason: e?.message ?? String(e) });
        return null;
      }
      if (!piano?.ok) { attesa.textContent = t('annulla.failed', { reason: motivoDetto(piano?.motivo) }); return null; }
      const { contenuto, conferma } = disegna(piano, { testoMessaggio: citato, alle: punto.alle });
      aperta?.contenuto?.replaceChildren(...contenuto);
      if (!conferma.disabled) conferma.focus();
      return aperta;
    },
  };
}
