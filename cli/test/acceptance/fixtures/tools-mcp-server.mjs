/*
 * s94 (A5j) — a minimal MCP server on stdio (newline-delimited JSON-RPC, as fixtures/elicit-mcp-server.mjs), with two tools that answer
 * at once: `create_pr` says which title it received, `list_prs` lists. Nothing is created anywhere: the answer is only text.
 */
import {createInterface} from 'node:readline';

const send=(message)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
const TOOLS=[
  {name:'create_pr',description:'Create a pull request with a title.',inputSchema:{type:'object',properties:{title:{type:'string'}}}},
  {name:'list_prs',description:'List the open pull requests.',inputSchema:{type:'object',properties:{}}},
  /* s95 (row 126, road A): declared non-destructive, so the kernel groups its calls of one answer on one card */
  {name:'add_label',description:'Add a label.',inputSchema:{type:'object',properties:{label:{type:'string'}}},annotations:{destructiveHint:false}},
];
function onRequest({id,method,params}){
  if(method==='initialize')return send({id,result:{protocolVersion:params?.protocolVersion??'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'gh-fake',version:'1.0.0'}}});
  if(method==='tools/list')return send({id,result:{tools:TOOLS}});
  if(method==='tools/call'){
    const text=params?.name==='create_pr'?`PR_CREATED ${String(params?.arguments?.title??'')}`:params?.name==='add_label'?`LABEL_ADDED ${String(params?.arguments?.label??'')}`:'PRS_LISTED none';
    return send({id,result:{content:[{type:'text',text}]}});
  }
  if(method==='ping')return send({id,result:{}});
  if(id!==undefined)send({id,error:{code:-32601,message:`Method not found: ${method}`}});
}
createInterface({input:process.stdin}).on('line',(line)=>{
  let message;try{message=JSON.parse(line);}catch{return;}
  if(message.method)onRequest(message);
});
