//! Guest execution only; no filesystem/WASI/network is linked into the component.
use anyhow::{ensure, Result};
use wasmtime::{Config, Engine, Store, StoreLimits, StoreLimitsBuilder};
use wasmtime::component::{Component, Linker};
use crate::{digest, wire::{pb, MAX_COMPONENT}, authority::MAX_SNAPSHOT};
// Parse the WIT at compile time as well as exercising its actual canonical ABI.
#[allow(dead_code)]
mod generated { wasmtime::component::bindgen!({path:"contracts/extension.wit",world:"read-probe"}); }
struct State<F> { read:F, limits:StoreLimits }
pub fn execute<F>(start:&pb::Start, read:F, fuel:u64) -> Result<u32>
where F: Fn(u64,u64,u32)->Result<Vec<u8>>+Send+Sync+'static {
    ensure!(!start.component.is_empty() && start.component.len()<=MAX_COMPONENT,"component size rejected");
    ensure!(start.generation==digest(&start.component) && start.request.len()==32,"generation/request rejected");
    let mut config=Config::new();
    config.wasm_component_model(true).consume_fuel(true).epoch_interruption(true)
        .max_wasm_stack(256*1024).wasm_memory64(false);
    let engine=Engine::new(&config)?;
    // Compile WASM/WAT only. Never deserialize guest-provided native code.
    let component=Component::new(&engine,&start.component)?;
    let mut linker=Linker::<State<F>>::new(&engine);
    linker.root().func_wrap("read", |store:wasmtime::StoreContextMut<'_,State<F>>,(high,low,target):(u64,u64,u32)| {
        let data=(store.data().read)(high,low,target)?;
        ensure!(data.len()<=MAX_SNAPSHOT,"broker response exceeds limit"); Ok((data,))
    })?;
    // Unknown imports (including all WASI interfaces) fail before instantiation.
    let prepared=linker.instantiate_pre(&component)?;
    let limits=StoreLimitsBuilder::new().memory_size(1024*1024).instances(4)
        .memories(2).tables(2).table_elements(256).trap_on_grow_failure(true).build();
    let mut store=Store::new(&engine,State{read,limits});
    store.limiter(|s|&mut s.limits);store.set_fuel(fuel)?;store.set_epoch_deadline(1);
    let (stop,receive)=std::sync::mpsc::channel::<()>();
    let clock_engine=engine.clone();
    let clock=std::thread::spawn(move|| {if matches!(receive.recv_timeout(std::time::Duration::from_secs(2)),
        Err(std::sync::mpsc::RecvTimeoutError::Timeout)){clock_engine.increment_epoch();}});
    let result=(|| {
        let instance=prepared.instantiate(&mut store)?;
        let function=instance.get_typed_func::<(u64,u64,u32),(u32,)>(&mut store,"run")?;
        let (result,)=function.call(&mut store,(start.lease_high,start.lease_low,start.target))?;
        function.post_return(&mut store)?; Ok(result)
    })();
    drop(stop);clock.join().map_err(|_|anyhow::anyhow!("epoch thread failed"))?;result
}
#[cfg(test)] mod tests {
    use super::*;
    fn start(text:&str)->pb::Start { let component=text.as_bytes().to_vec();pb::Start{generation:digest(&component).to_vec(),
        component,lease_high:1,lease_low:2,target:3,request:vec![4;32]} }
    #[test] fn actual_component_reads_and_computes() { for input in [b"abc".to_vec(),vec![],vec![255;4096]] {
        let expected:u32=input.iter().map(|v|u32::from(*v)).sum();
        assert_eq!(execute(&start(crate::COMPONENT),move|h,l,t|{ensure!((h,l,t)==(1,2,3),"ABI argument mismatch");Ok(input.clone())},500000).unwrap(),expected); } }
    #[test] fn unknown_import_is_not_linked() {let text=crate::COMPONENT.replace("(component","(component (import \"network\" (func))");
        let mut config=Config::new();config.wasm_component_model(true);
        Component::new(&Engine::new(&config).unwrap(),&text).unwrap();
        let error=execute(&start(&text),|_,_,_|Ok(vec![]),500000).unwrap_err();
        assert!(format!("{error:#}").contains("network")); }
    #[test] fn broker_denial_traps_guest() {let e=execute(&start(crate::COMPONENT),|_,_,_|anyhow::bail!("EXPECTED_BROKER_DENIAL"),500000).unwrap_err();assert!(format!("{e:#}").contains("EXPECTED_BROKER_DENIAL"));}
    #[test] fn response_cap() {let e=execute(&start(crate::COMPONENT),|_,_,_|Ok(vec![0;4097]),500000).unwrap_err();assert!(format!("{e:#}").contains("broker response exceeds limit"));}
    #[test] fn fuel_stops_loop() {let text=include_str!("../fixtures/loop.wat");
        let e=execute(&start(text),|_,_,_|Ok(vec![]),1000).unwrap_err();assert!(format!("{e:#}").contains("fuel"));}
    #[test] fn generation_mismatch_rejected() {let mut s=start(crate::COMPONENT);s.component[0]^=1;let e=execute(&s,|_,_,_|Ok(vec![]),1000).unwrap_err();assert!(e.to_string().contains("generation/request"));}
    #[test] fn memory_growth_is_bounded() {let text=crate::COMPONENT.replace(";; RESULT", "i32.const 32 memory.grow drop");
        let mut config=Config::new();config.wasm_component_model(true);
        Component::new(&Engine::new(&config).unwrap(),&text).unwrap();
        let e=execute(&start(&text),|_,_,_|Ok(vec![]),500000).unwrap_err();assert!(format!("{e:#}").contains("memory"));}
}
