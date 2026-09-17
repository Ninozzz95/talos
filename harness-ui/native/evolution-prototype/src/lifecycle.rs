//! Trusted, single-invocation cancellation; never deserialized from guest input.
use crate::authority::{Broker, Denial, MAX_SNAPSHOT};
use std::{fmt, sync::{Arc, atomic::{AtomicBool, AtomicU8, Ordering}}, time::{Duration, Instant}};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopReason { Cancelled, Deadline, AlreadyUsed, InvalidTimeout }
impl fmt::Display for StopReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { write!(f, "invocation {self:?}") }
}
impl std::error::Error for StopReason {}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Phase { New, Launching, Connected, WaitingForReply, ReadReceived, CompleteReceived, Closed }
struct State {
    broker: Broker,
    cancelled: AtomicBool,
    claimed: AtomicBool,
    pending_io: AtomicBool,
    phase: AtomicU8,
    timeout: Duration,
}
/// Cloneable by the trusted controller, not reusable for a second invocation.
/// cancel() closes broker admission under its own mutex before signalling I/O.
/// Previously admitted bytes stay charged even if delivery is interrupted.
#[derive(Clone)]
pub struct InvocationControl(Arc<State>);
impl InvocationControl {
    pub fn new(timeout: Duration) -> Result<Self, StopReason> {
        if timeout.is_zero() || timeout > Duration::from_secs(30) { return Err(StopReason::InvalidTimeout); }
        Ok(Self(Arc::new(State {
            broker: Broker::new(MAX_SNAPSHOT).expect("fixed broker bound"),
            cancelled: AtomicBool::new(false), claimed: AtomicBool::new(false),
            pending_io: AtomicBool::new(false), phase: AtomicU8::new(Phase::New as u8), timeout,
        })))
    }
    pub fn cancel(&self) -> Result<(), Denial> {
        let result = self.0.broker.cancel();
        // Even a poisoned authority mutex must wake the transport fail-closed.
        self.0.cancelled.store(true, Ordering::Release);
        result
    }
    pub fn bytes_released(&self) -> Result<usize, Denial> { self.0.broker.bytes_released() }
    pub fn phase(&self) -> Phase {
        match self.0.phase.load(Ordering::Acquire) {
            0 => Phase::New, 1 => Phase::Launching, 2 => Phase::Connected,
            3 => Phase::WaitingForReply, 4 => Phase::ReadReceived, 5 => Phase::CompleteReceived,
            _ => Phase::Closed,
        }
    }
    pub fn io_pending(&self) -> bool { self.0.pending_io.load(Ordering::Acquire) }
    pub(crate) fn set_phase(&self, phase: Phase) { self.0.phase.store(phase as u8, Ordering::Release); }
    pub(crate) fn broker(&self) -> &Broker { &self.0.broker }
    pub(crate) fn claim(&self) -> Result<WaitContext<'_>, StopReason> {
        if self.0.claimed.swap(true, Ordering::AcqRel) { return Err(StopReason::AlreadyUsed); }
        let wait = WaitContext { control: self, deadline: Instant::now() + self.0.timeout };
        wait.checkpoint()?;
        self.set_phase(Phase::Launching);
        Ok(wait)
    }
    pub(crate) fn pending(&self) -> PendingIo<'_> {
        self.0.pending_io.store(true, Ordering::Release);
        PendingIo(self)
    }
}
pub(crate) struct PendingIo<'a>(&'a InvocationControl);
impl Drop for PendingIo<'_> {
    fn drop(&mut self) { self.0.0.pending_io.store(false, Ordering::Release); }
}
pub(crate) struct WaitContext<'a> { pub control: &'a InvocationControl, pub deadline: Instant }
impl WaitContext<'_> {
    pub fn checkpoint(&self) -> Result<(), StopReason> {
        if self.control.0.cancelled.load(Ordering::Acquire) { return Err(StopReason::Cancelled); }
        if Instant::now() >= self.deadline {
            let _ = self.control.cancel();
            return Err(StopReason::Deadline);
        }
        Ok(())
    }
    pub fn slice_ms(&self) -> u32 {
        self.deadline.saturating_duration_since(Instant::now()).as_millis().clamp(1, 10) as u32
    }
}

#[cfg(test)] mod tests {
    use super::*;
    use crate::authority::{LeaseId, Subject};
    fn subject() -> Subject { Subject { session:[1;16], generation:[2;32], request:[3;32], epoch:1 } }
    #[test] fn timeout_bounds() {
        assert!(InvocationControl::new(Duration::ZERO).is_err());
        assert!(InvocationControl::new(Duration::from_secs(31)).is_err());
        assert!(InvocationControl::new(Duration::from_secs(30)).is_ok());
    }
    #[test] fn control_is_single_invocation_even_after_finish() {
        let c=InvocationControl::new(Duration::from_secs(1)).unwrap();
        assert!(c.claim().is_ok()); c.set_phase(Phase::Closed);
        assert!(matches!(c.claim(),Err(StopReason::AlreadyUsed)));
    }
    #[test] fn precancel_prevents_claim_without_launch() {
        let c=InvocationControl::new(Duration::from_secs(1)).unwrap(); c.cancel().unwrap();
        assert!(matches!(c.claim(),Err(StopReason::Cancelled))); assert_eq!(c.phase(),Phase::New);
    }
    #[test] fn cancel_is_sticky_and_closes_new_grants_and_reads() {
        let c=InvocationControl::new(Duration::from_secs(1)).unwrap(); let id=LeaseId([4;16]);
        c.broker().issue(id,subject(),1,b"abc",0,1000,2).unwrap();
        let first=c.broker().read(id,subject(),1,0).unwrap();
        c.cancel().unwrap(); c.cancel().unwrap();
        assert_eq!(c.broker().read(id,subject(),1,1),Err(Denial::Cancelled));
        assert_eq!(c.broker().issue(LeaseId([5;16]),subject(),1,b"a",0,1,1),Err(Denial::Cancelled));
        assert_eq!(&*first,b"abc"); assert_eq!(c.bytes_released(),Ok(3));
    }
    #[test] fn pending_guard_clears_on_error_or_unwind() {
        let c=InvocationControl::new(Duration::from_secs(1)).unwrap();
        { let _p=c.pending(); assert!(c.io_pending()); } assert!(!c.io_pending());
    }
    #[test] fn deadline_uses_one_absolute_instant() {
        let c=InvocationControl::new(Duration::from_secs(1)).unwrap();
        let expired=WaitContext{control:&c,deadline:Instant::now()};
        assert_eq!(expired.checkpoint(),Err(StopReason::Deadline));
        assert_eq!(c.broker().issue(LeaseId([4;16]),subject(),1,b"a",0,1,1),Err(Denial::Cancelled));
    }
    #[test] fn after_cancel_returns_all_concurrent_admissions_are_denied() {
        let c=InvocationControl::new(Duration::from_secs(1)).unwrap(); let id=LeaseId([4;16]);
        c.broker().issue(id,subject(),1,b"abc",0,1000,4).unwrap(); c.cancel().unwrap();
        let threads:Vec<_>=(0..32).map(|_| {let c=c.clone();std::thread::spawn(move||c.broker().read(id,subject(),1,0))}).collect();
        for thread in threads { assert_eq!(thread.join().unwrap(),Err(Denial::Cancelled)); }
        assert_eq!(c.bytes_released(),Ok(0));
    }
}
