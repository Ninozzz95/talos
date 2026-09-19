from pathlib import Path
import os, socket, subprocess, json, shutil
from datetime import datetime, timezone
out=Path(__file__).resolve().parent
harness=out.parents[2]/'harness-ui'
with socket.socket() as s:
    s.settimeout(2)
    if s.connect_ex(('127.0.0.1',4174))==0: raise SystemExit('Porta occupata: nessun avvio')
assert (harness/'server.mjs').is_file(), harness
shutil.make_archive(str(out/'sessions-before'),'zip',harness/'.sessions-store')
env=os.environ.copy()
env.update(TALOS_HARNESS_UI_PORT='4174',TALOS_HARNESS_UI_HOST='127.0.0.1',TALOS_OWNER_RUNTIME_MODULE=str(harness/'src/kernel/talosHarness.desktop-hotfix.mjs'),TALOS_HARNESS_UI_PUBLIC_DIR=str(harness/'public'),TALOS_HARNESS_UI_SESSIONS_DIR=str(harness/'.sessions-store'))
flags=subprocess.DETACHED_PROCESS|subprocess.CREATE_NEW_PROCESS_GROUP|subprocess.CREATE_BREAKAWAY_FROM_JOB
startup=subprocess.STARTUPINFO(); startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW; startup.wShowWindow=subprocess.SW_HIDE
with (out/'server.log').open('xb') as stdout,(out/'server.err.log').open('xb') as stderr:
    process=subprocess.Popen([r'C:/Program Files/nodejs/node.exe','server.mjs'],cwd=harness,env=env,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,close_fds=True,creationflags=flags,startupinfo=startup)
record={'pid':process.pid,'port':4174,'startedAt':datetime.now(timezone.utc).isoformat(),'harness':str(harness),'flags':flags,'node':'C:/Program Files/nodejs/node.exe'}
(out/'process.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print(json.dumps(record))
