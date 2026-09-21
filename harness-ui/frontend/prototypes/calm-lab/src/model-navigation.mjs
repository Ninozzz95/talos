import {compactCatalogFilters,validateCatalogFilters,emptyCatalogFilters} from './catalog-engine.mjs';
/** Pure route codec. Unknown models and malformed escapes fall back to the catalog. */
export function parseModelRoute(hash,models){
 const [path,search='']=hash.split('?');
 const qp=new URLSearchParams(search);let catalogFilters=emptyCatalogFilters();try{catalogFilters=validateCatalogFilters(JSON.parse(qp.get('f')||'{}'));}catch{}
 const route={catalogFilters,query:(qp.get('q')||'').slice(0,240),section:'models',tab:'models',detailId:null,detailTab:'card'};
 if(path.includes('/aspetto'))return {...route,section:'appearance'};
 const parts=path.split('/');
 if(parts[3]==='scheda'){
  let id;try{id=decodeURIComponent(parts[4]||'');}catch{return route;}
  if(!models.some(m=>m.id===id))return route;
  return {...route,detailId:id,detailTab:['card','files','compatibility'].includes(parts[5])?parts[5]:'card'};
 }
 const last=parts.at(-1);
 return {...route,tab:['models','providers','downloads','system'].includes(last)?last:'models'};
}
export function modelRoute(state){
 const qp=new URLSearchParams();if(state.query)qp.set('q',state.query.slice(0,240));const compact=compactCatalogFilters(state.catalogFilters);if(Object.keys(compact).length)qp.set('f',JSON.stringify(compact));const suffix=qp.size?'?'+qp.toString():'';
 if(state.section==='appearance')return '#/impostazioni/aspetto';
 if(state.detailId)return `#/impostazioni/modelli/scheda/${encodeURIComponent(state.detailId)}/${state.detailTab}${suffix}`;
 return `#/impostazioni/modelli/${state.tab}${suffix}`;
}
