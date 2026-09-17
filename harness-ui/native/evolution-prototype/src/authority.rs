//! In-memory authority core. The trusted caller supplies time and peer identity;
//! neither is accepted from a wire message. All state transitions are serialized.
use std::{collections::HashMap, sync::{Arc, Mutex}};

pub const MAX_SNAPSHOT: usize = 4096;
pub const MAX_LEASES: usize = 32;
pub const MAX_TTL_MS: u64 = 30_000;
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct LeaseId(pub [u8; 16]); // Deliberately no Debug/Display: never log bearer references.
impl LeaseId {
    pub fn words(self) -> (u64, u64) {
        (u64::from_le_bytes(self.0[..8].try_into().unwrap()),
         u64::from_le_bytes(self.0[8..].try_into().unwrap()))
    }
    pub fn from_words(high: u64, low: u64) -> Self {
        let mut bytes = [0; 16]; bytes[..8].copy_from_slice(&high.to_le_bytes());
        bytes[8..].copy_from_slice(&low.to_le_bytes()); Self(bytes)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Subject {
    pub session: [u8; 16], pub generation: [u8; 32], pub request: [u8; 32], pub epoch: u64,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Denial { InvalidGrant, Unknown, Subject, Target, Expired, Revoked, Exhausted, Cancelled, Poisoned }
struct Lease {
    subject: Subject, target: u32, snapshot: Arc<[u8]>, expires_ms: u64,
    remaining: u32, revoked: bool,
}
struct State { leases: HashMap<LeaseId, Lease>, bytes_left: usize, bytes_released: usize, cancelled: bool }
#[derive(Clone)]
pub struct Broker(Arc<Mutex<State>>);
impl Broker {
    pub fn new(bytes: usize) -> Result<Self, Denial> {
        if bytes > MAX_SNAPSHOT { return Err(Denial::InvalidGrant); }
        Ok(Self(Arc::new(Mutex::new(State { leases: HashMap::new(), bytes_left: bytes, bytes_released: 0, cancelled: false }))))
    }
    // Trusted provisioning only. This is NOT an exposed capability.* operation.
    pub fn issue(&self, id: LeaseId, subject: Subject, target: u32, snapshot: &[u8],
        now_ms: u64, ttl_ms: u64, uses: u32) -> Result<(), Denial> {
        let expires_ms = now_ms.checked_add(ttl_ms).ok_or(Denial::InvalidGrant)?;
        if id.0 == [0; 16] || subject.session == [0; 16] || subject.epoch == 0 || target == 0
            || ttl_ms == 0 || ttl_ms > MAX_TTL_MS || uses == 0 || uses > 4
            || snapshot.len() > MAX_SNAPSHOT { return Err(Denial::InvalidGrant); }
        let mut state = self.0.lock().map_err(|_| Denial::Poisoned)?;
        if state.cancelled { return Err(Denial::Cancelled); }
        if state.leases.len() >= MAX_LEASES || state.leases.contains_key(&id) {
            return Err(Denial::InvalidGrant);
        }
        state.leases.insert(id, Lease { subject, target, snapshot: Arc::from(snapshot), expires_ms,
            remaining: uses, revoked: false });
        Ok(())
    }
    pub fn read(&self, id: LeaseId, subject: Subject, target: u32, now_ms: u64) -> Result<Arc<[u8]>, Denial> {
        let mut state = self.0.lock().map_err(|_| Denial::Poisoned)?;
        if state.cancelled { return Err(Denial::Cancelled); }
        let lease = state.leases.get(&id).ok_or(Denial::Unknown)?;
        if lease.subject != subject { return Err(Denial::Subject); }
        if lease.target != target { return Err(Denial::Target); }
        if lease.revoked { return Err(Denial::Revoked); }
        if now_ms >= lease.expires_ms { return Err(Denial::Expired); }
        if lease.remaining == 0 || lease.snapshot.len() > state.bytes_left { return Err(Denial::Exhausted); }
        let data = Arc::clone(&lease.snapshot);
        // Single critical section: admission, use consumption and global debit.
        // No fresh I/O follows authorization: this returns an immutable snapshot.
        state.leases.get_mut(&id).unwrap().remaining -= 1;
        state.bytes_left -= data.len(); state.bytes_released += data.len();
        Ok(data)
    }
    pub fn revoke(&self, id: LeaseId) -> Result<(), Denial> {
        let mut state = self.0.lock().map_err(|_| Denial::Poisoned)?;
        state.leases.get_mut(&id).ok_or(Denial::Unknown)?.revoked = true;
        Ok(())
    }
    /// Permanent admission barrier for this broker. A read already admitted
    /// before this lock was acquired is charged and cannot be recalled.
    /// Cancellation never waits for an IPC peer or holds a transport lock.
    pub fn cancel(&self) -> Result<(), Denial> {
        let mut state = self.0.lock().map_err(|_| Denial::Poisoned)?;
        state.cancelled = true;
        Ok(())
    }
    pub fn bytes_released(&self) -> Result<usize, Denial> {
        Ok(self.0.lock().map_err(|_| Denial::Poisoned)?.bytes_released)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn subject() -> Subject { Subject { session: [1;16], generation:[2;32], request:[3;32], epoch:1 } }
    fn setup(uses: u32, budget: usize) -> (Broker, LeaseId) {
        let b = Broker::new(budget).unwrap(); let id = LeaseId([4;16]);
        b.issue(id, subject(), 1, b"abc", 100, 50, uses).unwrap(); (b, id)
    }
    #[test] fn words_round_trip() { let id=LeaseId([7;16]); let (h,l)=id.words(); assert!(LeaseId::from_words(h,l)==id); }
    #[test] fn single_use_is_atomic() {
        let (b,id)=setup(1,4096); let barrier=Arc::new(std::sync::Barrier::new(32));
        let threads:Vec<_>=(0..32).map(|_| { let b=b.clone();let gate=barrier.clone();
            std::thread::spawn(move || { gate.wait(); b.read(id,subject(),1,101).is_ok() }) }).collect();
        assert_eq!(threads.into_iter().map(|t|usize::from(t.join().unwrap())).sum::<usize>(),1);
        assert_eq!(b.bytes_released(),Ok(3));
    }
    #[test] fn binding_fields_are_all_required() {
        let (b,id)=setup(1,4096);
        for field in 0..4 { let mut s=subject(); match field { 0=>s.session[0]^=1,1=>s.generation[0]^=1,
            2=>s.request[0]^=1,_=>s.epoch+=1 }; assert_eq!(b.read(id,s,1,101),Err(Denial::Subject)); }
        assert_eq!(b.bytes_released(),Ok(0)); assert!(b.read(id,subject(),1,101).is_ok());
    }
    #[test] fn wrong_target_does_not_consume() { let(b,id)=setup(1,4096);
        assert_eq!(b.read(id,subject(),2,101),Err(Denial::Target)); assert!(b.read(id,subject(),1,101).is_ok()); }
    #[test] fn expired_at_boundary() { let(b,id)=setup(1,4096);assert_eq!(b.read(id,subject(),1,150),Err(Denial::Expired)); }
    #[test] fn revoke_is_idempotent_and_permanent() { let(b,id)=setup(1,4096);b.revoke(id).unwrap();b.revoke(id).unwrap();
        assert_eq!(b.read(id,subject(),1,101),Err(Denial::Revoked));assert_eq!(b.bytes_released(),Ok(0)); }
    #[test] fn global_budget_not_multiplied_by_leases() { let(b,id)=setup(4,3);
        let other=LeaseId([5;16]); b.issue(other,subject(),1,b"abc",100,50,4).unwrap();
        b.read(id,subject(),1,101).unwrap();assert_eq!(b.read(other,subject(),1,101),Err(Denial::Exhausted)); }
    #[test] fn unknown_and_reissue_rejected() { let(b,id)=setup(1,4096);
        assert_eq!(b.read(LeaseId([9;16]),subject(),1,101),Err(Denial::Unknown));
        assert_eq!(b.issue(id,subject(),1,b"x",100,50,1),Err(Denial::InvalidGrant)); }
    #[test] fn issuer_bounds_and_overflow() { let b=Broker::new(4096).unwrap();let id=LeaseId([8;16]);
        for (now,ttl,uses) in [(0,0,1),(0,30001,1),(u64::MAX,1,1),(0,1,0),(0,1,5)] {
            assert_eq!(b.issue(id,subject(),1,b"x",now,ttl,uses),Err(Denial::InvalidGrant)); }
        assert_eq!(b.issue(id,subject(),1,&[0;4097],0,1,1),Err(Denial::InvalidGrant));
        assert!(Broker::new(4097).is_err());
    }
    #[test] fn lease_table_is_bounded() { let b=Broker::new(4096).unwrap();
        for n in 1..=32 { b.issue(LeaseId([n;16]),subject(),1,b"x",0,1,1).unwrap(); }
        assert_eq!(b.issue(LeaseId([33;16]),subject(),1,b"x",0,1,1),Err(Denial::InvalidGrant)); }
    #[test] fn prior_output_is_not_recalled_by_revocation() { let(b,id)=setup(2,4096);
        let released=b.read(id,subject(),1,101).unwrap();b.revoke(id).unwrap();
        assert_eq!(&*released,b"abc");assert_eq!(b.read(id,subject(),1,102),Err(Denial::Revoked)); }
}
