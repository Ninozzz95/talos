/*
 * Decisione 201 (04/11/2026): la pulizia del testo di una pagina serve anche al SERVER (l'attrezzo `browser_page` legge la copia
 * pubblica della pagina aperta nel Browser), quindi vive in `harness-ui/src/testo-pagina.mjs`, un posto solo. Qui si riesporta, così
 * la vista Browser e chi la importava da qui restano com'erano.
 */
export { sembraHtml, testoLeggibile, riassuntoPulizia } from '../../../src/testo-pagina.mjs';
