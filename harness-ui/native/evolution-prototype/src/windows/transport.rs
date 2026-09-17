//! One invocation deadline, interruptible waits, and drained overlapped I/O.
//! No OVERLAPPED/event/buffer is freed while Windows may still access it.
use super::*;
use crate::lifecycle::WaitContext;

pub(super) struct Pipe { handle: Owned, worker: Handle }
impl Pipe {
    pub fn new(handle: Owned) -> Self { Self { handle, worker:null_mut() } }
    pub fn raw(&self) -> Handle { self.handle.0 }
    // Session retains the process handle until after this pipe is dropped.
    pub fn bind_worker(&mut self, process:Handle) { self.worker=process; }
    pub fn connect(&self, wait:&WaitContext<'_>) -> Result<()> {
        wait.checkpoint()?;
        let event=Owned::new(unsafe{CreateEventW(null(),1,0,null())})?;
        let mut ov:Overlapped=unsafe{zeroed()}; ov.event=event.0;
        if unsafe{ConnectNamedPipe(self.raw(),&mut ov)}!=0 { return Ok(()); }
        let error=unsafe{GetLastError()}; if error==535 { return Ok(()); }
        ensure!(error==997,"pipe connect {error}"); self.finish(&mut ov,wait)?; Ok(())
    }
    fn finish(&self, ov:&mut Overlapped, wait:&WaitContext<'_>) -> Result<u32> {
        let _pending=wait.control.pending();
        let result=(|| {
            loop {
                wait.checkpoint()?;
                let status=unsafe{WaitForSingleObject(ov.event,wait.slice_ms())};
                match status {
                    0 => { let mut n=0;
                        unsafe{check(GetOverlappedResult(self.raw(),ov,&mut n,0),"complete IPC")?;}
                        return Ok(n);
                    },
                    258 => {
                        if !self.worker.is_null() {
                            let state=unsafe{WaitForSingleObject(self.worker,0)};
                            ensure!(state==258,"worker exited/faulted while IPC pending ({state})");
                        }
                    },
                    _ => bail!("IPC wait failed: {status}"),
                }
            }
        })();
        if result.is_err() {
            // CancelIoEx is a request, not completion. ERROR_NOT_FOUND can race
            // normal completion. Always drain before dropping ov and its buffer.
            // Healthy Windows named-pipe cancellation is tested below; a stuck
            // kernel/driver is not bounded by this user-mode deadline.
            let mut n=0;
            unsafe{CancelIoEx(self.raw(),ov); GetOverlappedResult(self.raw(),ov,&mut n,1);}
        }
        result
    }
    pub fn transfer(&self, buffer:&mut [u8], write:bool, wait:&WaitContext<'_>) -> Result<()> {
        let mut offset=0;
        while offset<buffer.len() {
            wait.checkpoint()?;
            let event=Owned::new(unsafe{CreateEventW(null(),1,0,null())})?;
            let mut ov:Overlapped=unsafe{zeroed()}; ov.event=event.0; let mut n=0;
            let ok=unsafe{if write {WriteFile(self.raw(),buffer[offset..].as_ptr().cast(),(buffer.len()-offset)as u32,&mut n,&mut ov)}
                else{ReadFile(self.raw(),buffer[offset..].as_mut_ptr().cast(),(buffer.len()-offset)as u32,&mut n,&mut ov)}};
            if ok==0 {
                let error=unsafe{GetLastError()};
                ensure!(error==997,"IPC operation failed: Win32 {error}");
                n=self.finish(&mut ov,wait)?;
            }
            ensure!(n>0 && n as usize<=buffer.len()-offset,"IPC closed/invalid count");
            offset+=n as usize;
        }
        Ok(())
    }
    pub fn send(&self,message:&pb::Envelope,wait:&WaitContext<'_>)->Result<()> {
        let bytes=wire::encode(message)?; let mut frame=(bytes.len()as u32).to_le_bytes().to_vec(); frame.extend(bytes);
        self.transfer(&mut frame,true,wait)
    }
    pub fn receive(&self,wait:&WaitContext<'_>)->Result<pb::Envelope> {
        let mut prefix=[0;4]; self.transfer(&mut prefix,false,wait)?;
        let n=u32::from_le_bytes(prefix)as usize; ensure!(n>0 && n<=wire::MAX_FRAME,"IPC frame size");
        let mut bytes=vec![0;n]; self.transfer(&mut bytes,false,wait)?; wire::decode(&bytes)
    }
}
impl Drop for Pipe { fn drop(&mut self) { unsafe{DisconnectNamedPipe(self.raw());} } }
