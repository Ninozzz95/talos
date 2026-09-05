/*
 * Punto d'ingresso della app.
 *
 * Fase 1.1 del piano «il mockup diventa la app»: il cervello resta `legacy/app.js`
 * (il monolite, identico a `public/app.js` salvo il byte NUL scritto come
 * escape). Da qui in poi ogni pezzo che disegna DOM viene estratto in un
 * elemento a Light DOM sotto `src/components/`, uno per blocco `data-c` del
 * mockup, e questo file lo importa. Il monolite si svuota da solo.
 */
import './legacy/app.js';
