//! Windows process/transport adapter for the prototype, NOT the product root of trust.
mod ffi;
mod transport;
use transport::Pipe;
use crate::lifecycle::{InvocationControl, Phase, WaitContext};
#[cfg(feature="fault-injection")]
pub mod testing;
use ffi::*;
use anyhow::{bail,ensure,Context,Result};
use std::{ffi::{c_void,OsStr,OsString},fs::{self,File,OpenOptions},io::{Read,Write},
 mem::{size_of,zeroed},os::windows::{ffi::OsStrExt,fs::OpenOptionsExt,io::AsRawHandle},
 path::{Path,PathBuf},ptr::{null,null_mut},sync::{Arc,Mutex},time::{Duration,Instant}};
use crate::{authority::{LeaseId,Subject,MAX_SNAPSHOT},digest,random_id,wire::{self,pb}};
const DEADLINE_MS:u32=10_000;
const PIPE_ACCESS:u32=0x00100083; // READ_DATA|WRITE_DATA|READ_ATTRIBUTES|SYNCHRONIZE; not CREATE_PIPE_INSTANCE.
const JOB_FLAGS:u32=0x2000|0x8|0x100|0x200|0x400;
fn check(ok:i32,operation:&str)->Result<()>{ensure!(ok!=0,"{operation}: Win32 {}",unsafe{GetLastError()});Ok(())}
fn wide(s:&OsStr)->Result<Vec<u16>>{let mut v:Vec<_>=s.encode_wide().collect();ensure!(!v.contains(&0),"NUL in Windows string");v.push(0);Ok(v)}
fn w(s:&str)->Result<Vec<u16>>{wide(OsStr::new(s))}
struct Owned(Handle);
impl Owned {fn new(h:Handle)->Result<Self>{ensure!(!h.is_null() && h as isize != -1,"invalid OS handle: {}",unsafe{GetLastError()});Ok(Self(h))}}
impl Drop for Owned {fn drop(&mut self){unsafe{CloseHandle(self.0);}}}
struct Local(*mut c_void);
impl Drop for Local{fn drop(&mut self){unsafe{LocalFree(self.0);}}}
fn descriptor(text:&str)->Result<Local>{let mut p=null_mut();unsafe{check(ConvertStringSecurityDescriptorToSecurityDescriptorW(w(text)?.as_ptr(),1,&mut p,null_mut()),"SDDL")?;}Ok(Local(p))}
fn token_info(process:Handle,class:i32)->Result<Vec<usize>>{
 let mut h=null_mut();unsafe{check(OpenProcessToken(process,8,&mut h),"OpenProcessToken")?;}let token=Owned::new(h)?;
 let mut n=0;unsafe{GetTokenInformation(token.0,class,null_mut(),0,&mut n);}
 ensure!(n>0 && n<=65536,"token buffer size");let mut v=vec![0usize;(n as usize).div_ceil(size_of::<usize>())];
 unsafe{check(GetTokenInformation(token.0,class,v.as_mut_ptr().cast(),n,&mut n),"GetTokenInformation")?;}
 ensure!(n as usize<=v.len()*size_of::<usize>(),"token size changed");Ok(v)
}
fn sid_text(sid:Sid)->Result<String>{let mut p=null_mut();unsafe{check(ConvertSidToStringSidW(sid,&mut p),"SID")?;}let _m=Local(p.cast());
 let mut n=0;unsafe{while n<256 && *p.add(n)!=0{n+=1;}}ensure!(n<256,"SID size");Ok(String::from_utf16(unsafe{std::slice::from_raw_parts(p,n)})?)}
fn owner()->Result<String>{let t=token_info(unsafe{GetCurrentProcess()},1)?;sid_text(t[0] as Sid)}
fn same_container(process:Handle,sid:Sid)->Result<bool>{let state=token_info(process,29)?;if state[0] as u32==0{return Ok(false);}
 let package=token_info(process,31)?;Ok(unsafe{EqualSid(package[0]as Sid,sid)}!=0)}
fn acl(path:&Path,owner:&str,package:&str,access:&str,executable:bool)->Result<()>{
 let grant=if access.is_empty(){String::new()}else{format!("(A;OICI;{access};;;{package})")};
 let label=if executable{"ME"}else{"LW"};let sd=descriptor(&format!("D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;{owner}){grant}S:(ML;;NW;;;{label})"))?;
 let path=wide(path.as_os_str())?;
 // Owners may have WRITE_DAC without WRITE_OWNER on a newly inherited fixture.
 // Apply the final DACL first, then the final label; neither failure is ignored.
 unsafe{check(SetFileSecurityW(path.as_ptr(),4,sd.0),"fixture DACL")?;check(SetFileSecurityW(path.as_ptr(),0x10,sd.0),"fixture label")?;}Ok(())
}
struct Profile{name:Vec<u16>,sid:Sid,deleted:bool,retained:bool}
impl Profile{fn new(name:&str)->Result<Self>{let name=w(name)?;let mut sid=null_mut();let hr=unsafe{CreateAppContainerProfile(name.as_ptr(),name.as_ptr(),name.as_ptr(),null(),0,&mut sid)};
 ensure!(hr>=0,"new AppContainer failed: {hr:#x}");Ok(Self{name,sid,deleted:false,retained:false})}
 fn cleanup(&mut self)->Result<()>{let hr=unsafe{DeleteAppContainerProfile(self.name.as_ptr())};ensure!(hr>=0,"profile cleanup: {hr:#x}");self.deleted=true;Ok(())}}
impl Drop for Profile{fn drop(&mut self){unsafe{if !self.deleted && !self.retained{DeleteAppContainerProfile(self.name.as_ptr());}FreeSid(self.sid);}}}
struct Tree(PathBuf,bool);
impl Drop for Tree{fn drop(&mut self){if !self.1{let _=fs::remove_dir_all(&self.0);}}}
struct Attributes(Vec<usize>);
impl Attributes{fn new()->Result<Self>{let mut n=0;unsafe{InitializeProcThreadAttributeList(null_mut(),2,0,&mut n);}
 ensure!(n>0 && n<65536,"attribute size");let mut a=Self(vec![0;n.div_ceil(size_of::<usize>())]);unsafe{check(InitializeProcThreadAttributeList(a.ptr(),2,0,&mut n),"attribute init")?;}Ok(a)}
 fn ptr(&mut self)->*mut c_void{self.0.as_mut_ptr().cast()}
 fn set<T>(&mut self,key:usize,value:&mut T)->Result<()>{unsafe{check(UpdateProcThreadAttribute(self.ptr(),0,key,(value as *mut T).cast(),size_of::<T>(),null_mut(),null_mut()),"attribute set")}}}
impl Drop for Attributes{fn drop(&mut self){unsafe{DeleteProcThreadAttributeList(self.ptr());}}}
fn quote(arg:&OsStr)->Result<Vec<u16>>{let raw=wide(arg)?;let mut out=vec![34];let mut slashes=0;
 for &ch in &raw[..raw.len()-1]{if ch==92{slashes+=1;continue;}out.extend(std::iter::repeat_n(92,if ch==34{slashes*2+1}else{slashes}));out.push(ch);slashes=0;}
 out.extend(std::iter::repeat_n(92,slashes*2));out.push(34);Ok(out)}
struct Child{process:Owned,pid:u32}
impl Drop for Child{fn drop(&mut self){unsafe{if WaitForSingleObject(self.process.0,0)==258{TerminateProcess(self.process.0,125);WaitForSingleObject(self.process.0,DEADLINE_MS);}}}}
struct Session{profile:Profile,tree:Tree,job:Option<Owned>,child:Child,pipe:Option<Pipe>}
impl Session{
 fn new(worker:&Path,wait:&WaitContext<'_>)->Result<Self>{
  wait.checkpoint()?;
  ensure!(worker.is_absolute() && worker.is_file(),"absolute worker path required");
  let name=format!("TALOS.Extension.{}",random_id()?.iter().map(|v|format!("{v:02x}")).collect::<String>());
  let profile=Profile::new(&name)?;let owner=owner()?;let package=sid_text(profile.sid)?;
  let root=std::env::temp_dir().join(&name);fs::create_dir(&root)?;let tree=Tree(root,false);
  acl(&tree.0,&owner,&package,"GRGX",false)?;
  let exe=tree.0.join("worker.exe");fs::copy(worker,&exe)?;acl(&exe,&owner,&package,"GRGX",true)?;
  // Compare full bytes of the fixed official prototype worker, never guest AOT.
  ensure!(digest(&fs::read(worker)?)==digest(&fs::read(&exe)?),"worker copy mismatch");
  let sd=descriptor(&format!("D:P(A;;FA;;;SY)(A;;FA;;;{owner})(A;;0x{PIPE_ACCESS:08x};;;{package})S:(ML;;NW;;;LW)"))?;
  let sa=SecurityAttributes{length:size_of::<SecurityAttributes>()as u32,descriptor:sd.0,inherit:0};
  let pipe_name=OsString::from(format!("\\\\.\\pipe\\{name}"));
  let pipe=Pipe::new(Owned::new(unsafe{CreateNamedPipeW(wide(&pipe_name)?.as_ptr(),3|0x40000000|0x00080000,8,1,65536,65536,DEADLINE_MS,&sa)})?);
  let job=Owned::new(unsafe{CreateJobObjectW(null(),null())})?;let mut limits:ExtendedLimits=unsafe{zeroed()};
  limits.basic.flags=JOB_FLAGS;limits.basic.active=1;limits.process_memory=512*1024*1024;limits.job_memory=512*1024*1024;
  unsafe{check(SetInformationJobObject(job.0,9,(&limits as *const ExtendedLimits).cast(),size_of::<ExtendedLimits>()as u32),"job limits")?;}
  let mut actual:ExtendedLimits=unsafe{zeroed()};unsafe{check(QueryInformationJobObject(job.0,9,(&mut actual as *mut ExtendedLimits).cast(),size_of::<ExtendedLimits>()as u32,null_mut()),"read job limits")?;}
  ensure!(actual.basic.flags==JOB_FLAGS && actual.basic.active==1 && actual.process_memory==limits.process_memory && actual.job_memory==limits.job_memory,"job limits differ");
  let mut attributes=Attributes::new()?;let mut jobs=[job.0];let mut capabilities=SecurityCapabilities{sid:profile.sid,capabilities:null_mut(),count:0,reserved:0};
  attributes.set(0x2000d,&mut jobs)?;attributes.set(0x20009,&mut capabilities)?;
  let mut command=quote(exe.as_os_str())?;
  for a in [OsString::from("--serve"),pipe_name,std::process::id().to_string().into()]{command.push(32);command.extend(quote(&a)?);}command.push(0);
  let mut environment=vec![];
  for key in ["LOCALAPPDATA","SystemRoot"]{let value=std::env::var_os(key).context("missing bootstrap path")?;
   let mut pair=OsString::from(format!("{key}="));pair.push(value);environment.extend(wide(&pair)?);}environment.push(0);
  let mut si:StartupInfoEx=unsafe{zeroed()};si.startup.cb=size_of::<StartupInfoEx>()as u32;si.attributes=attributes.ptr();let mut pi:ProcessInformation=unsafe{zeroed()};
  wait.checkpoint()?;
  unsafe{check(CreateProcessW(wide(exe.as_os_str())?.as_ptr(),command.as_mut_ptr(),null(),null(),0,0x80000|0x400|4|0x08000000,
   environment.as_ptr().cast(),wide(tree.0.as_os_str())?.as_ptr(),&si.startup,&mut pi),"contained worker launch")?;}
  let child=Child{process:Owned::new(pi.process)?,pid:pi.pid};let thread=Owned::new(pi.thread)?;
  let mut inside=0;unsafe{check(IsProcessInJob(child.process.0,job.0,&mut inside),"initial Job identity")?;}
  ensure!(inside!=0 && same_container(child.process.0,profile.sid)?,"worker identity before resume");
  let mut session=Self{profile,tree,job:Some(job),child,pipe:Some(pipe)};
  session.pipe.as_mut().unwrap().bind_worker(session.child.process.0);
  let setup:Result<()>=(||{
   wait.checkpoint()?;
   ensure!(unsafe{ResumeThread(thread.0)}!=u32::MAX,"resume failed");
   session.pipe.as_ref().unwrap().connect(wait)?;let mut pid=0;
   unsafe{check(GetNamedPipeClientProcessId(session.pipe.as_ref().unwrap().raw(),&mut pid),"actual pipe peer")?;}
   ensure!(pid==session.child.pid && unsafe{GetProcessId(session.child.process.0)}==pid
     && unsafe{WaitForSingleObject(session.child.process.0,0)}==258,"peer is not retained live worker");
   ensure!(same_container(session.child.process.0,session.profile.sid)?,"peer container mismatch");Ok(())})();
  if let Err(error)=setup{
   let _=wait.control.cancel();
   let cleanup=session.cleanup();
   wait.control.set_phase(Phase::Closed);
   return Err(InvocationFailure{cause:error,cleanup,broker_bytes_admitted:wait.control.bytes_released().ok()}.into());
  }
  wait.control.set_phase(Phase::Connected); Ok(session)
 }
 fn wait_for_normal_exit(&self,wait:&WaitContext<'_>)->Result<u32>{
  loop{
   wait.checkpoint()?;
   match unsafe{WaitForSingleObject(self.child.process.0,wait.slice_ms())}{
    0=>{let mut code=0;unsafe{check(GetExitCodeProcess(self.child.process.0,&mut code),"worker exit code")?;}
     ensure!(code==0,"worker abnormal exit {code}");return Ok(code);},
    258=>{}, other=>bail!("worker exit wait failed: {other}"),
   }
  }
 }
 fn cleanup(&mut self)->CleanupReport{
  self.job.take();
  let terminated=unsafe{WaitForSingleObject(self.child.process.0,DEADLINE_MS)}==0;
  // All submitted overlapped operations have completed/drained before entry.
  self.pipe.take();
  let mut report=CleanupReport{worker_pid:self.child.pid,worker_terminated:terminated,
   worker_exit_code:None,tree_removed:false,profile_removed:false,errors:vec![]};
  if !terminated{self.tree.1=true;self.profile.retained=true;report.errors.push("worker survived Job close; retain fixtures for recovery".into());return report;}
  let mut code=0;
  if unsafe{GetExitCodeProcess(self.child.process.0,&mut code)}!=0{report.worker_exit_code=Some(code);}
  else{report.errors.push("worker exit code unavailable".into());}
  match fs::remove_dir_all(&self.tree.0){Ok(())=>report.tree_removed=true,Err(e)=>report.errors.push(format!("tree cleanup: {e}"))}
  match self.profile.cleanup(){Ok(())=>report.profile_removed=true,Err(e)=>report.errors.push(format!("profile cleanup: {e:#}"))}
  report
 }
}
impl Drop for Session{fn drop(&mut self){
 self.job.take();
 if unsafe{WaitForSingleObject(self.child.process.0,DEADLINE_MS)}!=0{self.tree.1=true;self.profile.retained=true;}
 self.pipe.take();
}}

#[derive(Debug)]
pub struct CleanupReport{
 pub worker_pid:u32,pub worker_terminated:bool,pub worker_exit_code:Option<u32>,
 pub tree_removed:bool,pub profile_removed:bool,pub errors:Vec<String>,
}
impl CleanupReport{pub fn complete(&self)->bool{self.worker_terminated && self.tree_removed && self.profile_removed && self.errors.is_empty()}}
#[derive(Debug)]
pub struct InvocationFailure{pub cause:anyhow::Error,pub cleanup:CleanupReport,pub broker_bytes_admitted:Option<usize>}
impl std::fmt::Display for InvocationFailure{
 fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result{write!(f,"{}; cleanup: {:?}",self.cause,self.cleanup)}
}
impl std::error::Error for InvocationFailure{
 fn source(&self)->Option<&(dyn std::error::Error+'static)>{Some(self.cause.as_ref())}
}

// This connection carries no environment, host path or authority-issuing method.
pub fn worker(pipe:&OsStr,parent:u32)->Result<()>{
 ensure!(pipe.to_string_lossy().starts_with("\\\\.\\pipe\\TALOS.Extension."),"unexpected pipe namespace");
 let file=OpenOptions::new().access_mode(PIPE_ACCESS).open(pipe)?;let mut actual=0;
 unsafe{check(GetNamedPipeServerProcessId(file.as_raw_handle(),&mut actual),"worker server identity")?;}ensure!(parent!=0 && actual==parent,"wrong supervisor PID");
 let io=Arc::new(Mutex::new(file));
 fn send(file:&mut File,message:&pb::Envelope)->Result<()>{let bytes=wire::encode(message)?;file.write_all(&(bytes.len()as u32).to_le_bytes())?;file.write_all(&bytes)?;Ok(())}
 fn receive(file:&mut File)->Result<pb::Envelope>{let mut size=[0;4];file.read_exact(&mut size)?;let n=u32::from_le_bytes(size)as usize;
  ensure!(n>0 && n<=wire::MAX_FRAME,"worker frame size");let mut bytes=vec![0;n];file.read_exact(&mut bytes)?;wire::decode(&bytes)}
 let pb::envelope::Body::Start(start)=receive(&mut *io.lock().map_err(|_|anyhow::anyhow!("poisoned IPC"))?)?.body.unwrap() else{bail!("expected Start");};
 let shared=io.clone();let generation=start.generation.clone();let request=start.request.clone();
 let result=crate::engine::execute(&start,move|high,low,target|{
  let mut file=shared.lock().map_err(|_|anyhow::anyhow!("poisoned IPC"))?;
  send(&mut file,&wire::envelope(pb::envelope::Body::Read(pb::Read{lease_high:high,lease_low:low,target,generation:generation.clone(),request:request.clone()})))?;
  let pb::envelope::Body::Data(data)=receive(&mut file)?.body.unwrap() else{bail!("expected Data");};
  ensure!(data.denied==0 && data.contents.len()<=MAX_SNAPSHOT,"broker denied read");Ok(data.contents)
 },500_000);
 let complete=match result{Ok(value)=>pb::Complete{ok:true,value,error:String::new()},Err(error)=>pb::Complete{ok:false,value:0,error:format!("{error:#}").chars().take(256).collect()}};
 send(&mut *io.lock().map_err(|_|anyhow::anyhow!("poisoned IPC"))?,&wire::envelope(pb::envelope::Body::Complete(complete)))?;Ok(())
}
#[derive(Clone,Copy)]pub enum Policy{Active,Revoked,Expired,WrongSubject,WrongTarget,RevokeAfterRead}
#[derive(Debug)]pub struct Outcome{pub completed:bool,pub value:u32,pub bytes_released:usize,pub denied:u32,pub worker_terminated:bool,pub worker_exit_code:u32}
pub fn invoke(worker:&Path,component:&[u8],snapshot:&[u8],policy:Policy)->Result<Outcome>{
 let control=InvocationControl::new(Duration::from_millis(DEADLINE_MS.into()))?;
 invoke_cancellable(worker,component,snapshot,policy,&control)
}
/// Trusted-controller API, not an operation on the guest wire. The token is single-use.
pub fn invoke_cancellable(worker:&Path,component:&[u8],snapshot:&[u8],policy:Policy,control:&InvocationControl)->Result<Outcome>{
 invoke_inner(worker,component,snapshot,policy,control,false)
}
#[cfg(feature="dev-adapter")]
pub(crate) fn invoke_dev_fixture(worker:&Path,control:&InvocationControl,
 before_start:&dyn Fn()->Result<()>)->Result<Outcome>{
 invoke_inner_hook(worker,crate::COMPONENT.as_bytes(),crate::SAMPLE,Policy::Active,control,false,Some(before_start))
}
fn invoke_inner(worker:&Path,component:&[u8],snapshot:&[u8],policy:Policy,control:&InvocationControl,pause_read:bool)->Result<Outcome>{
 invoke_inner_hook(worker,component,snapshot,policy,control,pause_read,None)
}
fn invoke_inner_hook(worker:&Path,component:&[u8],snapshot:&[u8],policy:Policy,control:&InvocationControl,pause_read:bool,
 before_start:Option<&dyn Fn()->Result<()>>)->Result<Outcome>{
 ensure!(component.len()<=wire::MAX_COMPONENT && snapshot.len()<=MAX_SNAPSHOT,"prototype input bound");
 let wait=control.claim()?;
 let mut session=match Session::new(worker,&wait){Ok(s)=>s,Err(e)=>{
  let _=control.cancel();control.set_phase(Phase::Closed);return Err(e);
 }};
 let result:Result<Outcome>=(||{
  // Opt-in trusted development controller checkpoint, after OS/peer checks.
  if let Some(ready)=before_start{ready()?;wait.checkpoint()?;}
  let generation=digest(component);let mut binding=b"TALOS.READ.SNAPSHOT.v1\0".to_vec();binding.extend(generation);binding.extend(digest(snapshot));
  let subject=Subject{session:random_id()?,generation,request:digest(&binding),epoch:1};let id=LeaseId(random_id()?);
  let broker=control.broker();
  let mut granted=subject;if matches!(policy,Policy::WrongSubject){granted.session=random_id()?;}
  let clock=Instant::now();let now=if matches!(policy,Policy::Expired){MAX_TTL_FOR_TEST}else{0};
  broker.issue(id,granted,1,snapshot,0,MAX_TTL_FOR_TEST,if matches!(policy,Policy::RevokeAfterRead){2}else{1}).map_err(|e|anyhow::anyhow!("{e:?}"))?;
  if matches!(policy,Policy::Revoked){broker.revoke(id).map_err(|e|anyhow::anyhow!("{e:?}"))?;}
  let (high,low)=id.words();let pipe=session.pipe.as_ref().unwrap();
  pipe.send(&wire::envelope(pb::envelope::Body::Start(pb::Start{component:component.to_vec(),lease_high:high,lease_low:low,
   target:if matches!(policy,Policy::WrongTarget){2}else{1},generation:generation.to_vec(),request:subject.request.to_vec()})),&wait)?;
  let mut denied=0;let mut reads=0;
  for _ in 0..5{
   control.set_phase(Phase::WaitingForReply);
   match pipe.receive(&wait)?.body.unwrap(){
   pb::envelope::Body::Read(read)=>{
    control.set_phase(Phase::ReadReceived);
    #[cfg(feature="fault-injection")]
    if pause_read{loop{wait.checkpoint()?;std::thread::sleep(Duration::from_millis(5));}}
    #[cfg(not(feature="fault-injection"))]
    let _=pause_read;
    wait.checkpoint()?;
    let valid=read.generation==subject.generation && read.request==subject.request;
    let value=if valid{broker.read(LeaseId::from_words(read.lease_high,read.lease_low),subject,read.target,now+clock.elapsed().as_millis()as u64)}else{Err(crate::authority::Denial::Subject)};
    reads+=1;let data=match value{Ok(bytes)=>pb::Data{contents:bytes.to_vec(),denied:0},Err(_)=>{denied+=1;pb::Data{contents:vec![],denied:1}}};
    if matches!(policy,Policy::RevokeAfterRead) && reads==1{broker.revoke(id).map_err(|e|anyhow::anyhow!("{e:?}"))?;}
    pipe.send(&wire::envelope(pb::envelope::Body::Data(data)),&wait)?;
   },
   pb::envelope::Body::Complete(done)=>{control.set_phase(Phase::CompleteReceived);wait.checkpoint()?;ensure!(done.error.len()<=1024,"result text bound");return Ok(Outcome{completed:done.ok,value:done.value,
    bytes_released:broker.bytes_released().map_err(|e|anyhow::anyhow!("{e:?}"))?,denied,worker_terminated:false,worker_exit_code:0});},
   _=>bail!("operation not allowed in current phase"),
  }}bail!("frame budget exhausted")
 })();
 // A Complete frame is only a claim. Require an observed, normal process exit.
 let result=result.and_then(|mut out|{out.worker_exit_code=session.wait_for_normal_exit(&wait)?;Ok(out)});
 let admission_closed=control.broker().cancel().map_err(|e|anyhow::anyhow!("close broker admission: {e:?}"));
 let admission_error=admission_closed.as_ref().err().map(|e|format!("{e:#}"));
 let result=result.and_then(|out|admission_closed.map(|_|out)).and_then(|out|{wait.complete()?;Ok(out)});
 if result.is_err(){let _=control.cancel();}
 let mut cleanup=session.cleanup();
 if let Some(error)=admission_error{cleanup.errors.push(error);}
 let broker_bytes_admitted=control.bytes_released().ok();
 control.set_phase(Phase::Closed);
 match result{
  Err(cause)=>Err(InvocationFailure{cause,cleanup,broker_bytes_admitted}.into()),
  Ok(_) if !cleanup.complete()=>Err(InvocationFailure{cause:anyhow::anyhow!("invocation cleanup incomplete"),cleanup,broker_bytes_admitted}.into()),
  Ok(mut out)=>{out.worker_terminated=true;Ok(out)},
 }
}
const MAX_TTL_FOR_TEST:u64=30_000;
#[cfg(test)]mod tests{use super::*;
 #[test]fn quoting_and_flags(){assert_eq!(String::from_utf16(&quote(OsStr::new("a b\\")).unwrap()).unwrap(),"\"a b\\\\\"");
 assert!(quote(OsStr::new("a\0b")).is_err());assert_eq!(PIPE_ACCESS&4,0);assert_eq!(JOB_FLAGS&(0x800|0x1000),0);assert_ne!(JOB_FLAGS&8,0);}}
