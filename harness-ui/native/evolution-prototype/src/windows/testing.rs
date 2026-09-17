//! Explicit fault-injection feature only. Not linked into normal binaries.
use super::*;

pub fn invoke_with_held_read(worker:&Path,control:&InvocationControl)->Result<Outcome>{
    invoke_inner(worker,crate::COMPONENT.as_bytes(),crate::SAMPLE,Policy::Active,control,true)
}
fn hang()->! { loop { std::thread::sleep(Duration::from_secs(60)); } }
fn abrupt_exit(code:u32)->! {
    unsafe{TerminateProcess(GetCurrentProcess(),code);}
    hang()
}
pub fn fault_worker(pipe:&OsStr,parent:u32)->Result<()> {
    ensure!(pipe.to_string_lossy().starts_with("\\\\.\\pipe\\TALOS.Extension."),"fixture pipe namespace");
    let mut file=OpenOptions::new().access_mode(PIPE_ACCESS).open(pipe)?;
    let mut actual=0;
    unsafe{check(GetNamedPipeServerProcessId(file.as_raw_handle(),&mut actual),"fixture server identity")?;}
    ensure!(parent!=0 && actual==parent,"fixture server mismatch");
    let mut prefix=[0;4]; file.read_exact(&mut prefix)?;
    let n=u32::from_le_bytes(prefix)as usize; ensure!(n>0 && n<=wire::MAX_FRAME,"fixture frame size");
    let mut bytes=vec![0;n]; file.read_exact(&mut bytes)?;
    let pb::envelope::Body::Start(start)=wire::decode(&bytes)?.body.unwrap() else{bail!("fixture Start required")};
    let mode=std::str::from_utf8(&start.component)?;
    match mode {
        "crash" => abrupt_exit(86),
        "silent" => hang(),
        "partial-stall" => { file.write_all(&16u32.to_le_bytes())?; file.write_all(&[8])?; hang() },
        "partial-close" => { file.write_all(&16u32.to_le_bytes())?; file.write_all(&[8])?; Ok(()) },
        "oversized-frame" => { file.write_all(&((wire::MAX_FRAME+1)as u32).to_le_bytes())?; hang() },
        "complete-hang" | "complete-crash" => {
            let message=wire::envelope(pb::envelope::Body::Complete(pb::Complete{ok:true,value:4275,error:String::new()}));
            let bytes=wire::encode(&message)?;
            file.write_all(&(bytes.len()as u32).to_le_bytes())?; file.write_all(&bytes)?;
            if mode=="complete-crash" { abrupt_exit(86); } hang()
        },
        _ => bail!("unknown fixture mode"),
    }
}
/// Publish only the just-created synthetic subject to the external test, then
/// remain alive. The external controller kills this process without destructors.
pub fn supervisor_crash_fixture(worker:&Path)->Result<()> {
    let control=InvocationControl::new(Duration::from_secs(30))?;
    let wait=control.claim()?;
    let session=Session::new(worker,&wait)?;
    let name=String::from_utf16(&session.profile.name[..session.profile.name.len()-1])?;
    println!("READY|{}|{}",session.child.pid,name); std::io::stdout().flush()?;
    // Keep both Session and the sole Job handle alive until TerminateProcess.
    std::hint::black_box(&session);
    hang()
}

struct DerivedSid(Sid);
impl Drop for DerivedSid{fn drop(&mut self){unsafe{FreeSid(self.0);}}}

pub struct CrashWitness { process:Owned, profile:Vec<u16>, tree:PathBuf, cleaned:bool }
impl CrashWitness {
    /// Retain the process before terminating its supervisor. This intentionally
    /// does NOT duplicate/open the Job; that would defeat KILL_ON_JOB_CLOSE.
    pub fn retain(pid:u32,name:&str)->Result<Self> {
        let suffix=name.strip_prefix("TALOS.Extension.").context("crash fixture prefix")?;
        ensure!(suffix.len()==32 && suffix.bytes().all(|b|b.is_ascii_hexdigit()),"crash fixture identifier");
        let profile=w(name)?; let mut sid=null_mut();
        let hr=unsafe{DeriveAppContainerSidFromAppContainerName(profile.as_ptr(),&mut sid)};
        ensure!(hr>=0 && !sid.is_null(),"derive fixture SID: {hr:#x}");
        let sid=DerivedSid(sid);
        let process=Owned::new(unsafe{OpenProcess(0x00101000,0,pid)})?;
        let matches=same_container(process.0,sid.0);
        ensure!(matches? && unsafe{GetProcessId(process.0)}==pid && unsafe{WaitForSingleObject(process.0,0)}==258,
            "crash witness is not the live contained subject");
        let tree=std::env::temp_dir().join(name);
        ensure!(tree.is_dir() && tree.join("worker.exe").is_file(),"crash fixture absent");
        Ok(Self{process,profile,tree,cleaned:false})
    }
    pub fn wait_for_exit(&self)->Result<()> {
        ensure!(unsafe{WaitForSingleObject(self.process.0,5000)}==0,"worker survived abrupt Supervisor exit");
        Ok(())
    }
    /// Explicit reconciliation by the outer TEST, not crash recovery implemented
    /// in the product. Only this exact validated fixture/profile is removed.
    pub fn cleanup(&mut self)->Result<()> {
        self.wait_for_exit()?;
        fs::remove_dir_all(&self.tree)?;
        let hr=unsafe{DeleteAppContainerProfile(self.profile.as_ptr())};
        ensure!(hr>=0,"orphan test profile cleanup: {hr:#x}");
        self.cleaned=true; Ok(())
    }
}
impl Drop for CrashWitness {
    fn drop(&mut self) { if !self.cleaned && unsafe{WaitForSingleObject(self.process.0,0)}==0 { let _=self.cleanup(); } }
}
