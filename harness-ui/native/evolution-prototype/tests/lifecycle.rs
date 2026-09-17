#![cfg(all(windows,target_arch="x86_64",feature="fault-injection"))]
use std::{io::BufRead,path::Path,process::{Command,Stdio},sync::mpsc,time::{Duration,Instant}};
use talos_evolution_prototype::{lifecycle::{InvocationControl,Phase,StopReason},
    windows::{invoke_cancellable,InvocationFailure,Policy,testing},COMPONENT,SAMPLE};
fn worker()->&'static Path { Path::new(env!("CARGO_BIN_EXE_talos-extension-worker")) }
fn fixture()->&'static Path { Path::new(env!("CARGO_BIN_EXE_talos-lifecycle-fixture")) }
fn control()->InvocationControl { InvocationControl::new(Duration::from_secs(2)).unwrap() }
fn checked_failure(error:anyhow::Error,control:&InvocationControl)->InvocationFailure {
    let failure=error.downcast::<InvocationFailure>().expect("expected lifecycle failure, not unrelated setup error");
    assert!(failure.cleanup.complete(),"{failure:?}");
    assert_eq!(control.phase(),Phase::Closed);
    assert!(!control.io_pending(),"overlapped I/O must have been drained before return");
    println!("lifecycle failure observed: {}; cleanup={:?}",failure.cause,failure.cleanup);
    failure
}
fn deadline_case(mode:&str) {
    let c=control(); let began=Instant::now();
    let failure=checked_failure(invoke_cancellable(fixture(),mode.as_bytes(),SAMPLE,Policy::Active,&c).unwrap_err(),&c);
    assert_eq!(failure.cause.downcast_ref::<StopReason>(),Some(&StopReason::Deadline));
    assert_eq!(c.bytes_released(),Ok(0));
    assert!(began.elapsed()<Duration::from_secs(8),"worker termination did not respect test bound");
}
#[test] fn silent_connected_worker_hits_absolute_deadline(){deadline_case("silent");}
#[test] fn partial_frame_cannot_extend_deadline(){deadline_case("partial-stall");}
#[test] fn complete_then_hang_is_not_success(){deadline_case("complete-hang");}
#[test] fn crash_after_start_is_reported_and_cleaned(){
    let c=control();let failure=checked_failure(invoke_cancellable(fixture(),b"crash",SAMPLE,Policy::Active,&c).unwrap_err(),&c);
    assert_eq!(failure.cleanup.worker_exit_code,Some(86)); assert_eq!(c.bytes_released(),Ok(0));
}
#[test] fn complete_then_abnormal_exit_is_not_success(){
    let c=control();let failure=checked_failure(invoke_cancellable(fixture(),b"complete-crash",SAMPLE,Policy::Active,&c).unwrap_err(),&c);
    assert!(failure.cause.to_string().contains("worker abnormal exit 86"),"{failure}");
    assert_eq!(failure.cleanup.worker_exit_code,Some(86));
}
#[test] fn partial_frame_and_normal_exit_are_not_completion(){
    let c=control();let failure=checked_failure(invoke_cancellable(fixture(),b"partial-close",SAMPLE,Policy::Active,&c).unwrap_err(),&c);
    assert_eq!(failure.cleanup.worker_exit_code,Some(0)); assert_eq!(c.bytes_released(),Ok(0));
}
#[test] fn oversized_frame_is_rejected_without_body_allocation(){
    let c=control();let failure=checked_failure(invoke_cancellable(fixture(),b"oversized-frame",SAMPLE,Policy::Active,&c).unwrap_err(),&c);
    assert!(failure.cause.to_string().contains("IPC frame size")); assert_eq!(c.bytes_released(),Ok(0));
}
fn wait_until(control:&InvocationControl,condition:impl Fn()->bool) {
    let deadline=Instant::now()+Duration::from_secs(10);
    while !condition() {
        assert_ne!(control.phase(),Phase::Closed,"invocation ended before checkpoint");
        assert!(Instant::now()<deadline,"checkpoint not reached");
        std::thread::sleep(Duration::from_millis(2));
    }
}
#[test] fn cancel_interrupts_an_actual_pending_pipe_read(){
    let c=InvocationControl::new(Duration::from_secs(15)).unwrap();let other=c.clone();
    let task=std::thread::spawn(move||invoke_cancellable(fixture(),b"silent",SAMPLE,Policy::Active,&other));
    wait_until(&c,||c.phase()==Phase::WaitingForReply && c.io_pending());
    let cancel=Instant::now();c.cancel().unwrap();
    let failure=checked_failure(task.join().unwrap().unwrap_err(),&c);
    assert_eq!(failure.cause.downcast_ref::<StopReason>(),Some(&StopReason::Cancelled));
    assert_eq!(c.bytes_released(),Ok(0));assert!(cancel.elapsed()<Duration::from_secs(3));
}
#[test] fn cancel_while_real_wasm_host_call_waits_releases_no_snapshot(){
    let c=InvocationControl::new(Duration::from_secs(15)).unwrap();let other=c.clone();
    let task=std::thread::spawn(move||testing::invoke_with_held_read(worker(),&other));
    // The real component requested read; the broker is deliberately withholding
    // it before admission, and the worker waits in a synchronous host call.
    wait_until(&c,||c.phase()==Phase::ReadReceived);
    let cancel=Instant::now();c.cancel().unwrap();
    let failure=checked_failure(task.join().unwrap().unwrap_err(),&c);
    assert_eq!(failure.cause.downcast_ref::<StopReason>(),Some(&StopReason::Cancelled));
    assert_eq!(c.bytes_released(),Ok(0));assert!(cancel.elapsed()<Duration::from_secs(3));
}
#[test] fn precancel_is_not_reused_and_new_invocation_can_run(){
    let c=control();c.cancel().unwrap();
    let error=invoke_cancellable(worker(),COMPONENT.as_bytes(),SAMPLE,Policy::Active,&c).unwrap_err();
    assert_eq!(error.downcast_ref::<StopReason>(),Some(&StopReason::Cancelled));
    assert_eq!(c.phase(),Phase::New);
    let error=invoke_cancellable(worker(),COMPONENT.as_bytes(),SAMPLE,Policy::Active,&c).unwrap_err();
    assert_eq!(error.downcast_ref::<StopReason>(),Some(&StopReason::AlreadyUsed));
    let fresh=InvocationControl::new(Duration::from_secs(10)).unwrap();
    let out=invoke_cancellable(worker(),COMPONENT.as_bytes(),SAMPLE,Policy::Active,&fresh).unwrap();
    assert!(out.completed && out.worker_terminated);assert_eq!(out.worker_exit_code,0);assert_eq!(out.value,4275);
}
struct Guard(std::process::Child);
impl Drop for Guard{fn drop(&mut self){if self.0.try_wait().ok().flatten().is_none(){let _=self.0.kill();let _=self.0.wait();}}}
#[test] fn abrupt_supervisor_death_closes_sole_job_and_stops_retained_worker(){
    let child=Command::new(fixture()).arg("--supervisor-crash-fixture").arg(worker())
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    let mut supervisor=Guard(child);
    let stdout=supervisor.0.stdout.take().unwrap();let (tx,rx)=mpsc::channel();
    let reader=std::thread::spawn(move||{let mut line=String::new();
        let r=std::io::BufReader::new(stdout).read_line(&mut line).map(|_|line);let _=tx.send(r);});
    let line=rx.recv_timeout(Duration::from_secs(15)).expect("crash fixture handshake timed out").unwrap();
    let fields:Vec<_>=line.trim().split('|').collect();assert_eq!(fields.len(),3);assert_eq!(fields[0],"READY");
    let mut witness=testing::CrashWitness::retain(fields[1].parse().unwrap(),fields[2]).unwrap();
    // No graceful request and no Rust Drop in the Supervisor. The witness holds
    // only a process handle, never a second Job handle.
    supervisor.0.kill().unwrap();let status=supervisor.0.wait().unwrap();assert!(!status.success());
    witness.wait_for_exit().unwrap(); witness.cleanup().unwrap(); reader.join().unwrap();
    println!("abrupt Supervisor exit: retained worker stopped; exact orphan test fixtures reconciled");
}
#[test] fn normal_worker_cli_has_no_fault_entry(){
    let status=Command::new(worker()).arg("--supervisor-crash-fixture").arg(worker()).status().unwrap();
    assert_eq!(status.code(),Some(64));
}
