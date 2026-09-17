//! Opt-in, fixed-fixture development controller. Not owner authentication.
//! The official Node caller, Supervisor and worker still belong to the trusted
//! development setup. No arbitrary source/path/grant can cross this protocol.
use anyhow::{ensure, Result};
use prost::Message;
use std::io::{Read, Write};
pub mod pb { include!(concat!(env!("OUT_DIR"), "/talos.devbridge.v1.rs")); }
use pb::{Frame, frame::{Kind, Status}};
pub const MAX_FRAME: usize = 256;

pub fn decode(bytes: &[u8]) -> Result<Frame> {
    ensure!(!bytes.is_empty() && bytes.len() <= MAX_FRAME, "development frame bound");
    let value = Frame::decode(bytes)?;
    // This deliberately narrow development protocol rejects unknown/duplicate
    // fields, nonminimal varints and alternate orderings. Not a claim that
    // arbitrary Protobuf has a universal canonical serialization.
    ensure!(value.encode_to_vec() == bytes, "noncanonical development frame");
    ensure!(value.version == 1 && value.invocation_id.len() == 16
        && value.invocation_id.iter().any(|b| *b != 0), "development version/identity");
    ensure!((1..=5).contains(&value.kind), "development kind");
    Ok(value)
}
fn read_frame(input: &mut impl Read) -> Result<Frame> {
    let mut prefix = [0; 4];
    input.read_exact(&mut prefix)?;
    let n = u32::from_le_bytes(prefix) as usize;
    ensure!(n > 0 && n <= MAX_FRAME, "development prefix bound");
    let mut bytes = vec![0; n];
    input.read_exact(&mut bytes)?;
    decode(&bytes)
}
fn write_frame(output: &mut impl Write, message: &Frame) -> Result<()> {
    let bytes = message.encode_to_vec();
    decode(&bytes)?;
    output.write_all(&(bytes.len() as u32).to_le_bytes())?;
    output.write_all(&bytes)?;
    output.flush()?;
    Ok(())
}
fn command(value: &Frame, id: &[u8], kind: Kind) -> Result<()> {
    ensure!(value.invocation_id == id && value.kind == kind as i32, "wrong invocation/command");
    let expected = Frame { version: 1, invocation_id: id.to_vec(), kind: kind as i32, ..Frame::default() };
    ensure!(*value == expected, "request contains output/unsupported fields");
    Ok(())
}
fn worker_hash(text: &str) -> Result<[u8;32]> {
    ensure!(text.len() == 64 && text.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)), "expected worker SHA-256");
    let mut bytes = [0;32];
    for (i,b) in bytes.iter_mut().enumerate() { *b = u8::from_str_radix(&text[2*i..2*i+2],16)?; }
    Ok(bytes)
}

#[cfg(all(windows, target_arch="x86_64"))]
pub fn run() -> Result<()> {
    use crate::{lifecycle::{InvocationControl, StopReason}, windows::{InvocationFailure, Outcome}};
    use std::{sync::mpsc::{self, RecvTimeoutError}, time::{Duration, Instant}};
    let args: Vec<_> = std::env::args().skip(1).collect();
    ensure!(args.len() == 2 && args[0] == "--dev-stdio", "development entry arguments");
    let expected_hash = worker_hash(&args[1])?;
    let worker = std::env::current_exe()?.with_file_name("talos-extension-worker.exe");
    // Only a sibling official binary, never a path supplied through stdin.
    let metadata = std::fs::metadata(&worker)?;
    ensure!(metadata.is_file() && metadata.len() <= 512*1024*1024, "worker file bound");
    let mut worker_bytes = Vec::new();
    std::fs::File::open(&worker)?.take(512*1024*1024 + 1).read_to_end(&mut worker_bytes)?;
    ensure!(worker_bytes.len() as u64 == metadata.len()
        && crate::digest(&worker_bytes) == expected_hash, "worker digest mismatch");
    drop(worker_bytes);
    enum Event { Input(Result<Frame>), Ready, Done(Result<Outcome>) }
    let (tx, rx) = mpsc::sync_channel::<Event>(8);
    let input_tx = tx.clone();
    // Exactly one bounded reader; it owns no OS Job, broker or filesystem
    // fixture. Main returns only after the invocation thread/cleanup finishes.
    // A still-blocked stdin reader ends with this one-shot process; not a
    // per-request thread leak in a persistent Supervisor.
    std::thread::spawn(move || {
        let stdin = std::io::stdin(); let mut input = stdin.lock();
        for _ in 0..4 {
            let frame = read_frame(&mut input);
            let bad = frame.is_err();
            if input_tx.send(Event::Input(frame)).is_err() || bad { return; }
        }
        let _ = input_tx.send(Event::Input(Err(anyhow::anyhow!("command budget exceeded"))));
    });
    let Event::Input(Ok(first)) = rx.recv_timeout(Duration::from_secs(5))? else {
        anyhow::bail!("missing development RUN");
    };
    command(&first, &first.invocation_id, Kind::Run)?;
    let id = first.invocation_id;
    let control = InvocationControl::new(Duration::from_secs(10))?;
    let other = control.clone();
    let (gate_tx, gate_rx) = mpsc::sync_channel::<bool>(1);
    let invocation = std::thread::spawn(move || {
        let hook = || -> Result<()> {
            tx.send(Event::Ready)?;
            ensure!(gate_rx.recv_timeout(Duration::from_secs(10))?, StopReason::Cancelled);
            Ok(())
        };
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crate::windows::invoke_dev_fixture(&worker, &other, &hook)
        })).unwrap_or_else(|_| Err(anyhow::anyhow!("development invocation panicked")));
        let _ = tx.send(Event::Done(outcome));
    });
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut ready = false; let mut continued = false; let mut cancelled = false;
    let mut invalid = false; let mut gate_released = false;
    let mut stdout = std::io::stdout().lock();
    let outcome = loop {
        if Instant::now() >= deadline && !cancelled {
            invalid = true; cancelled = true;
            let _ = control.cancel();
            if !gate_released { let _ = gate_tx.try_send(false); gate_released = true; }
        }
        match rx.recv_timeout(Duration::from_millis(10)) {
            Ok(Event::Ready) => {
                ready = true;
                let response = Frame { version:1, invocation_id:id.clone(), kind:Kind::Ready as i32,
                    worker_digest:expected_hash.to_vec(), ..Frame::default() };
                if write_frame(&mut stdout, &response).is_err() {
                    invalid = true; cancelled = true; let _ = control.cancel();
                    if !gate_released { let _ = gate_tx.try_send(false); gate_released = true; }
                }
            },
            Ok(Event::Input(frame)) => {
                match frame {
                    Ok(ref f) if !invalid && !cancelled && command(f, &id, Kind::Cancel).is_ok() => {
                        cancelled = true; let _ = control.cancel();
                        if !gate_released { let _ = gate_tx.try_send(false); gate_released = true; }
                    },
                    Ok(ref f) if !invalid && ready && !continued && !cancelled
                        && command(f, &id, Kind::Continue).is_ok() => {
                        continued = true; gate_released = true;
                        if gate_tx.send(true).is_err() { invalid = true; let _ = control.cancel(); }
                    },
                    _ => {
                        invalid = true; cancelled = true; let _ = control.cancel();
                        if !gate_released { let _ = gate_tx.try_send(false); gate_released = true; }
                    },
                }
            },
            Ok(Event::Done(result)) => break result,
            Err(RecvTimeoutError::Timeout) => {},
            Err(RecvTimeoutError::Disconnected) => {
                invalid = true; break Err(anyhow::anyhow!("development channel closed"));
            },
        }
    };
    // No success message before native cleanup and thread termination.
    ensure!(invocation.join().is_ok(), "development invocation thread failed");
    let mut response = Frame { version:1, invocation_id:id, kind:Kind::Finished as i32,
        status:Status::Failed as i32, ..Frame::default() };
    match outcome {
        Ok(out) => {
            response.bytes_released = out.bytes_released as u32;
            response.worker_terminated = out.worker_terminated;
            response.cleanup_complete = true; // invoke only returns Ok after checked cleanup
            response.worker_exit_code = out.worker_exit_code;
            if !invalid && out.completed && out.worker_terminated && out.worker_exit_code == 0
                && out.bytes_released == crate::SAMPLE.len() && out.value == 4275 && out.denied == 0 {
                response.status = Status::Succeeded as i32; response.value = out.value;
            }
        },
        Err(error) => {
            if let Some(failure) = error.downcast_ref::<InvocationFailure>() {
                response.bytes_released = failure.broker_bytes_admitted.unwrap_or(0) as u32;
                response.worker_terminated = failure.cleanup.worker_terminated;
                response.cleanup_complete = failure.cleanup.complete();
                response.worker_exit_code = failure.cleanup.worker_exit_code.unwrap_or(u32::MAX);
                if !invalid && failure.cause.downcast_ref::<StopReason>() == Some(&StopReason::Cancelled) {
                    response.status = Status::Cancelled as i32;
                }
            }
        },
    }
    write_frame(&mut stdout, &response)?;
    // Exit zero means the bridge transported its typed outcome, not that guest
    // computation succeeded. Node requires BOTH outcome and process close.
    Ok(())
}

#[cfg(test)] mod tests {
    use super::*;
    fn sample() -> Frame { Frame { version:1, invocation_id:vec![1;16], kind:Kind::Run as i32, ..Frame::default() } }
    #[test] fn command_roundtrip_and_golden_bytes() {
        let f=sample(); let mut b=vec![8,1,18,16]; b.extend([1;16]); b.extend([24,1]);
        assert_eq!(f.encode_to_vec(), b); assert_eq!(decode(&b).unwrap(),f);
    }
    #[test] fn framing_handles_partial_reads() {
        let mut b=vec![]; write_frame(&mut b,&sample()).unwrap();
        assert_eq!(read_frame(&mut &b[..]).unwrap(),sample());
    }
    #[test] fn lengths_reject_before_body_allocation() {
        for n in [0u32,257,u32::MAX] { assert!(read_frame(&mut &n.to_le_bytes()[..]).is_err()); }
    }
    #[test] fn truncated_prefix_and_body_reject() {
        assert!(read_frame(&mut &[1u8,0][..]).is_err());
        assert!(read_frame(&mut &[4u8,0,0,0,8,1][..]).is_err());
    }
    #[test] fn noncanonical_unknown_and_duplicate_fields_reject() {
        let b=sample().encode_to_vec();
        for tail in [vec![8,1],vec![88,1],vec![32,0]] {
            let mut bad=b.clone();bad.extend(tail);assert!(decode(&bad).is_err());
        }
        let mut bad=vec![8,129,0]; bad.extend(&b[2..]); assert!(decode(&bad).is_err());
    }
    #[test] fn nonce_version_kind_and_output_injection_reject() {
        let f=sample();for id in [vec![],vec![0;16],vec![1;15],vec![1;17]]{
            let mut x=f.clone();x.invocation_id=id;assert!(decode(&x.encode_to_vec()).is_err());
        }
        let mut x=f.clone();x.version=2;assert!(decode(&x.encode_to_vec()).is_err());
        x=f.clone();x.kind=99;assert!(decode(&x.encode_to_vec()).is_err());
        x=f.clone();x.status=Status::Succeeded as i32;assert!(command(&x,&f.invocation_id,Kind::Run).is_err());
        assert!(command(&f,&[2;16],Kind::Run).is_err());
    }
    #[test] fn pinned_worker_hash_is_exact_not_a_path() {
        assert_eq!(worker_hash(&"ab".repeat(32)).unwrap(),[0xab;32]);
        for s in ["", "../worker.exe", &"AB".repeat(32), &"0".repeat(63), &"g".repeat(64)]{
            assert!(worker_hash(s).is_err());
        }
    }
}
