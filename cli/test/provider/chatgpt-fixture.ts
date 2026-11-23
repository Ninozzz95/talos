/*
 * «Continue with ChatGPT» in the CLI (owner 13/10/2026): the fake OpenAI the tests sign in to and send to. ⛔ Never the real service,
 * and never the owner's plan (his rule, relayed by the desktop session on 13/10): discovery, keys, token exchange and renewal,
 * revocation, the plan's model list and one Responses stream, all answered here. It counts what it was asked.
 */
import {generateKeyPairSync,sign} from 'node:crypto';
import type {openChatgptPlan} from '../../src/provider/chatgpt-plan.ts';

export const ISSUER='https://auth.openai.com';
export const DISCOVERY=`${ISSUER}/.well-known/openid-configuration`;
export const TOKEN=`${ISSUER}/api/accounts/oauth/token`;
export const JWKS=`${ISSUER}/.well-known/jwks.json`;
export const REVOKE=`${ISSUER}/api/accounts/oauth/revoke`;
export const MODELS='https://api.openai.com/v1/models';
export const RESPONSES='https://api.openai.com/v1/responses';
export const SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
/** The scopes of a sign-in that did not grant the plan. */
export const SCOPES_WITHOUT_PLAN='openid profile email offline_access';
export const PLAN_MODEL='chatgpt:gpt-5.5';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken=(body:Record<string,unknown>)=>{const head=`${b64({alg:'RS256',kid:'k1'})}.${b64(body)}`;return `${head}.${sign('sha256',Buffer.from(head),privateKey).toString('base64url')}`;};

const sse=(...events:Array<{type:string}>)=>events.map(event=>`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
const answer=(text:string)=>({id:'resp_1',object:'response',created_at:1791700000,status:'completed',model:'gpt-5.5',
  output:[{id:'msg_1',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}],
  usage:{input_tokens:3,input_tokens_details:{cached_tokens:0},output_tokens:2,output_tokens_details:{reasoning_tokens:0},total_tokens:5}});
/** One Responses stream that says `text` (the shape of harness-ui/tests/chatgpt-instradamento.test.mjs). */
export const responsesStream=(text:string,headers:Record<string,string>={})=>new Response(sse({type:'response.created',response:{id:'resp_1',created_at:1791700000,model:'gpt-5.5'}} as any,
  {type:'response.output_item.added',output_index:0,item:{id:'msg_1',type:'message',role:'assistant',content:[]}} as any,
  {type:'response.output_text.delta',item_id:'msg_1',output_index:0,content_index:0,delta:text} as any,
  {type:'response.output_item.done',output_index:0,item:answer(text).output[0]} as any,
  {type:'response.completed',response:answer(text)} as any),{status:200,headers:{'content-type':'text/event-stream',...headers}});

export type FakeCall={url:string;body:string|null;authorization:string|null};
export function fakeOpenAi({now=()=>Date.now(),scope=SCOPES,slowRenewal=0,say='Done by the plan.',responseHeaders={}}:{now?:()=>number;scope?:string|(()=>string);slowRenewal?:number;say?:string;responseHeaders?:Record<string,string>}={}){
  const calls:FakeCall[]=[];
  let nonce:string|null=null;let turn=0;const spent=new Set<string>();
  const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  const fetchImpl=async(url:string|URL|Request,options:RequestInit={})=>{
    const address=String(url);const body=typeof options.body==='string'?options.body:null;
    const authorization=new Headers(options.headers??{}).get('authorization');
    calls.push({url:address,body,authorization});
    if(address===DISCOVERY)return json(200,{issuer:ISSUER,token_endpoint:TOKEN,jwks_uri:JWKS,revocation_endpoint:REVOKE});
    if(address===JWKS)return json(200,{keys:[{...publicKey.export({format:'jwk'}),kid:'k1',use:'sig',alg:'RS256'}]});
    if(address===REVOKE)return json(200,{});
    if(address===TOKEN){
      const form=new URLSearchParams(body??'');
      if(form.get('grant_type')==='refresh_token'){
        const used=form.get('refresh_token')??'';
        if(slowRenewal)await new Promise(resolve=>setTimeout(resolve,slowRenewal));
        /* the real service: a refresh token works once */
        if(spent.has(used))return json(400,{error:'refresh_token_reused'});
        spent.add(used);
      }
      turn+=1;
      return json(200,{access_token:`ACCESS-${turn}`,refresh_token:`REFRESH-${turn}`,token_type:'Bearer',expires_in:3600,scope:typeof scope==='function'?scope():scope,
        id_token:idToken({iss:ISSUER,aud:form.get('client_id'),exp:now()/1000+600,nonce,sub:'person-1',email:'nino@example.com'})});
    }
    if(address===MODELS)return authorization?.startsWith('Bearer ACCESS-')
      ?json(200,{data:[{slug:'gpt-5.5',display_name:'GPT-5.5',visibility:'list'},{slug:'hidden-one',display_name:'Hidden',visibility:'hide'}]})
      :json(401,{error:{message:'no'}});
    if(address===RESPONSES)return authorization?.startsWith('Bearer ACCESS-')?responsesStream(say,responseHeaders):json(401,{error:{message:'no'}});
    throw new Error(`fake OpenAI: ${address}`);
  };
  return{fetchImpl:fetchImpl as typeof fetch,calls,useNonce:(value:string|null)=>{nonce=value;},
    renewals:()=>calls.filter(c=>c.url===TOKEN&&/grant_type=refresh_token/u.test(c.body??'')).length,
    sent:()=>calls.filter(c=>c.url===RESPONSES)};
}
export type FakeOpenAi=ReturnType<typeof fakeOpenAi>;

/** The browser's part: it follows the address TALOS gave to the loopback, with the code OpenAI would have sent. */
export async function followSignIn(url:string,fake:FakeOpenAi,scope:string=SCOPES):Promise<Response>{
  const asked=new URL(url).searchParams;
  fake.useNonce(asked.get('nonce'));
  const back=new URL(asked.get('redirect_uri')!);
  back.search=new URLSearchParams({state:asked.get('state')!,code:'CODE',scope,...(asked.get('client_id')==='dynamic_agent_client'?{client_id:'oaiapp_test1'}:{})}).toString();
  const page=await fetch(back);await page.text();
  return page;
}
export async function signIn(plan:Awaited<ReturnType<typeof openChatgptPlan>>,fake:FakeOpenAi){
  const started=await plan!.start();
  const page=await followSignIn(started.url,fake);
  return{started,page,outcome:await started.outcome};
}
/** Puts the fake in front of the process's fetch for OpenAI's two hosts and leaves every other address to what was there. */
export function installFakeOpenAi(fake:FakeOpenAi):()=>void{
  const before=globalThis.fetch;
  globalThis.fetch=(async(input:any,init?:any)=>{
    const address=typeof input==='string'?input:input instanceof URL?input.href:String(input?.url);
    return /^https:\/\/(auth|api)\.openai\.com\//u.test(address)?fake.fetchImpl(address,init):before(input,init);
  }) as typeof fetch;
  return()=>{globalThis.fetch=before;};
}
