/**
 * R4 gate E14 (lane A): acceptance proves there is no network. A local HTTP proxy on 127.0.0.1 refuses and records every
 * outbound request TALOS tries. TALOS runs with NODE_USE_ENV_PROXY=1 and HTTP(S)_PROXY pointing at it, while NO_PROXY
 * keeps the fake provider on 127.0.0.1 reachable directly: anything else lands here and is refused (owner rule: no real
 * provider or network call). Taken from the R4 research harness (`scratchpad/r4-research/acc/r4help.ts`).
 */
import http from 'node:http';
import type {AddressInfo} from 'node:net';

export type SinkHit={method:string;url:string;host?:string};
export type RefusingSink={url:string;hits:SinkHit[];close:()=>Promise<void>};

export async function startRefusingSink():Promise<RefusingSink>{
  const hits:SinkHit[]=[];
  const server=http.createServer((req,res)=>{hits.push({method:req.method??'',url:req.url??'',...(req.headers.host?{host:req.headers.host}:{})});res.writeHead(403);res.end('refused by the TALOS acceptance sink');});
  /* A client that resets the refused tunnel (OpenCode does, 2026-09-26 bench) must not throw an unhandled 'error'. */
  server.on('connect',(req,socket)=>{hits.push({method:'CONNECT',url:req.url??''});socket.on('error',()=>{});socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');});
  server.on('clientError',(_error,socket)=>{socket.destroy();});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as AddressInfo).port;
  return{url:`http://127.0.0.1:${port}`,hits,close:()=>new Promise<void>(resolve=>{server.closeAllConnections?.();server.close(()=>resolve());})};
}

/** The environment that sends TALOS's outbound requests to the sink and keeps loopback direct. */
export function sinkEnv(sink:RefusingSink):Record<string,string>{
  return{NODE_USE_ENV_PROXY:'1',HTTP_PROXY:sink.url,HTTPS_PROXY:sink.url,http_proxy:sink.url,https_proxy:sink.url,NO_PROXY:'127.0.0.1,localhost,::1',no_proxy:'127.0.0.1,localhost,::1'};
}
