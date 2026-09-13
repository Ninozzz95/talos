import os,sys,json,platform,subprocess,datetime,pathlib,socket,time
base=pathlib.Path('/mnt/data/talos-audit')
out=base/'deliverables/desktop-audit-kit/evidence'
repos=[('talos','Ninozzz95/talos'),('hermes','NousResearch/hermes-agent'),('codex-cli-source','openai/codex'),('aider-local-cli','Aider-AI/aider'),('goose','aaif-goose/goose'),('opencode','anomalyco/opencode'),('cline','cline/cline'),('kilo','Kilo-Org/kilocode'),('zed','zed-industries/zed'),('roo-historical','RooCodeInc/Roo-Code'),('continue-historical','continuedev/continue')]
def run(argv,timeout=12):
 t=time.monotonic()
 try:
  p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout,env={**os.environ,'GIT_TERMINAL_PROMPT':'0'})
  return {'argv':argv,'exit_code':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'elapsed_ms':(time.monotonic()-t)*1000}
 except Exception as e:
  return {'argv':argv,'exit_code':None,'error_type':type(e).__name__,'error':str(e),'elapsed_ms':(time.monotonic()-t)*1000}
results=[]
for name,repo in repos:
 target=base/'work'/('clone-'+name)
 r=run(['git','-c','credential.helper=','clone','--depth=1','--filter=blob:none','--no-checkout','https://github.com/'+repo+'.git',str(target)])
 r.update(name=name,repository=repo,checked_out=False,executed_product=False,kind='acquisition_attempt_not_product_benchmark')
 results.append(r)
(out/'clone-attempts.json').write_text(json.dumps(results,indent=2))
env={'observed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'system':platform.system(),'kernel':platform.release(),'machine':platform.machine(),'python':sys.version,'node':run(['node','--version']),'npm':run(['npm','--version']),'git':run(['git','--version']),'logical_cpus_visible':os.cpu_count(),'desktop_product_runs':0,'successful_clones':sum(r.get('exit_code')==0 for r in results),'clone_attempts':len(results),'api_credentials_supplied_for_benchmark':False,'runtime_checks':{}}
for f in ['/sys/fs/cgroup/cpu.max','/sys/fs/cgroup/memory.max']:
 try: env[f]=pathlib.Path(f).read_text().strip()
 except OSError: env[f]=None
for prog in ['pwsh','powershell','wine','electron','chromium']:
 import shutil
 env['runtime_checks'][prog]=shutil.which(prog)
try: env['github_dns']=socket.getaddrinfo('github.com',443)
except OSError as e: env['github_dns']={'error':str(e)}
(out/'environment.json').write_text(json.dumps(env,indent=2))
print(json.dumps({'attempts':len(results),'cloned':env['successful_clones'],'product_runs':0,'platform':env['system'],'node':env['node']['stdout'].strip()},indent=2))
