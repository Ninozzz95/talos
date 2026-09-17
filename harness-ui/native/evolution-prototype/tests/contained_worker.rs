#![cfg(all(windows,target_arch="x86_64"))]
use talos_evolution_prototype::{windows::{invoke,Policy},COMPONENT,SAMPLE};
fn run(component:&str,policy:Policy)->talos_evolution_prototype::windows::Outcome{
 invoke(std::path::Path::new(env!("CARGO_BIN_EXE_talos-extension-worker")),component.as_bytes(),SAMPLE,policy).unwrap()
}
#[test]fn actual_component_in_separate_appcontainer(){let out=run(COMPONENT,Policy::Active);
 assert!(out.completed&&out.worker_terminated);assert_eq!(out.value,SAMPLE.iter().map(|v|u32::from(*v)).sum::<u32>());assert_eq!(out.bytes_released,SAMPLE.len());assert_eq!(out.denied,0);}
#[test]fn denied_leases_release_no_bytes(){for policy in [Policy::Revoked,Policy::Expired,Policy::WrongSubject,Policy::WrongTarget]{let out=run(COMPONENT,policy);
 assert!(!out.completed);assert_eq!(out.bytes_released,0);assert_eq!(out.denied,1);assert!(out.worker_terminated);}}
#[test]fn replay_and_mid_invocation_revocation(){let twice=COMPONENT.replace(";; SECOND_READ","local.get $high local.get $low local.get $target i32.const 0 call $read");
 for policy in [Policy::Active,Policy::RevokeAfterRead]{let out=run(&twice,policy);assert!(!out.completed);assert_eq!(out.bytes_released,SAMPLE.len());assert_eq!(out.denied,1);assert!(out.worker_terminated);}}
#[test]fn infinite_component_traps_without_host_read(){let out=run(include_str!("../fixtures/loop.wat"),Policy::Active);
 assert!(!out.completed);assert_eq!(out.bytes_released,0);assert!(out.worker_terminated);}
#[test]fn unknown_import_never_receives_snapshot(){let code=COMPONENT.replace("(component","(component (import \"network\" (func))");let out=run(&code,Policy::Active);
 assert!(!out.completed);assert_eq!(out.bytes_released,0);assert!(out.worker_terminated);}
