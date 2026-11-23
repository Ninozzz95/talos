import {sanitizeStatus} from './footer.ts';

export function headerLine({workspace,status}:{workspace:string;status:string}){
  const place=sanitizeStatus(workspace);
  const state=sanitizeStatus(status);
  return ['TALOS',place,state].filter(Boolean).join(' · ');
}
