/*
 * s42 — a minimal MCP server on stdio (newline-delimited JSON-RPC, the MCP stdio transport), written by hand so the
 * acceptance proof does not depend on a server SDK. One tool, `create_pr`: when it is called the server asks the person,
 * through the client, for the pull request's details (`elicitation/create`, form mode, the mockup step-17 fields) and
 * answers with what it received. A client that did not declare the capability gets the error the MCP SDK returns.
 */
import {createInterface} from 'node:readline';

const send=(message)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...message})+'\n');
let clientCanElicit=false;
let nextId=1;
const waiting=new Map();

const SCHEMA={type:'object',required:['repo'],properties:{
  repo:{type:'string',title:'Repository',default:'acme/shop-api'},
  base:{type:'string',title:'Base branch',default:'main'},
  draft:{type:'boolean',title:'Draft pull request',default:true},
  labels:{type:'array',title:'Labels',items:{type:'string',enum:['auth','tests','bug']},default:['auth','tests']},
}};

function ask(params){
  const id=`elicit-${nextId++}`;
  send({id,method:'elicitation/create',params});
  return new Promise((resolve)=>waiting.set(id,resolve));
}

async function onRequest(message){
  const {id,method,params}=message;
  if(method==='initialize'){
    clientCanElicit=Boolean(params?.capabilities?.elicitation);
    return send({id,result:{protocolVersion:params?.protocolVersion??'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'github-fake',version:'1.0.0'}}});
  }
  if(method==='tools/list')return send({id,result:{tools:[{name:'create_pr',description:'Create a pull request (asks the person for the details).',inputSchema:{type:'object',properties:{}}}]}});
  if(method==='tools/call'){
    if(!clientCanElicit)return send({id,result:{content:[{type:'text',text:'Client does not support form elicitation.'}],isError:true}});
    const answer=await ask({mode:'form',message:'needs details to create the pull request',requestedSchema:SCHEMA});
    const text=answer?.action==='accept'?`PR_CREATED ${JSON.stringify(answer.content)}`:`PR_NOT_CREATED ${answer?.action}`;
    return send({id,result:{content:[{type:'text',text}]}});
  }
  if(method==='ping')return send({id,result:{}});
  if(id!==undefined)send({id,error:{code:-32601,message:`Method not found: ${method}`}});
}

createInterface({input:process.stdin}).on('line',(line)=>{
  let message;try{message=JSON.parse(line);}catch{return;}
  if(message.method){void onRequest(message);return;}
  const resolve=waiting.get(message.id);
  if(resolve){waiting.delete(message.id);resolve(message.result??{action:'cancel'});}
});
