/*
 * Stage 7.10b (mockup PANELS.provider): a catalogue provider as the /provider sheet shows it — whether it can answer now (a
 * key set, no key, a local engine running or not), what its key is (never the key itself: where it comes from) and its
 * address. The words for a key's source are the picker's (provider-picker.ts providerKeySourceLabel), so a benched key, an
 * environment key not answered or declined keep saying so.
 */
import {t} from '../i18n/index.ts';
import type {TuiProvider} from './catalog-service.ts';
import {providerKeySourceLabel} from './overlays/provider-picker.ts';
import type {ProviderView} from './panel/commands.ts';

/** `reachable`: a local engine answered (true), did not (false), was not checked (null). */
export function providerViewOf(row:TuiProvider,{current,reachable}:{current:boolean;reachable:boolean|null}):ProviderView{
  /* «Continue with ChatGPT» (13/10/2026): signed in to, never given a key — its row says so, and `k` has nothing to ask */
  if(row.authType==='oauth-pkce'){
    const signedIn=row.keySource==='saved';
    return{id:row.id,label:row.label,search:row.description,current,state:row.configured?'signedIn':signedIn?'planOff':'signedOut',
      desc:row.configured?t('panel.provider.planPays'):signedIn?t('panel.provider.planNotEnabled'):t('panel.provider.enterToSignIn'),address:row.endpointHost,key:signedIn?'signed-in':'signed-out',needsKey:false,signIn:true};
  }
  const localEngine=row.local&&!row.requiresKey;
  const state:ProviderView['state']=localEngine?(reachable===false?'down':'local'):row.configured?(row.requiresKey?'key':'ready'):'none';
  const desc=state==='down'?t('panel.provider.startIt'):state==='local'?t('panel.provider.onComputer')
    :state==='none'&&(row.keySource==='missing'||!row.keySource)?t('panel.provider.addKey'):providerKeySourceLabel(row);
  const key:ProviderView['key']=!row.requiresKey?'none':row.keySource==='saved'&&row.configured?'stored':row.keySource==='environment'&&row.configured?'environment':'missing';
  /* 14/10/2026 (B2; owner: the Z.AI key only to the address you chose): the plan and the balance share a host, so the Z.AI row names
     the address in use, or says none is chosen */
  const address=row.addressChosen===false?t('panel.provider.addressNotChosen'):row.address?[row.address,row.endpointHost].filter(Boolean).join(' · '):row.endpointHost;
  return{id:row.id,label:row.label,search:row.description,current,state,desc,address,key,needsKey:row.requiresKey};
}
