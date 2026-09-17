fn main()->anyhow::Result<()>{
 #[cfg(all(windows,target_arch="x86_64"))]{
  #[cfg(feature="dev-adapter")]
  if std::env::args().nth(1).as_deref()==Some("--dev-stdio") {
   return talos_evolution_prototype::dev_bridge::run();
  }
  anyhow::ensure!(std::env::args().skip(1).collect::<Vec<_>>()==["--self-test"],"prototype accepts --self-test only");
  let worker=std::env::current_exe()?.with_file_name("talos-extension-worker.exe");
  let out=talos_evolution_prototype::windows::invoke(&worker,talos_evolution_prototype::COMPONENT.as_bytes(),
   talos_evolution_prototype::SAMPLE,talos_evolution_prototype::windows::Policy::Active)?;
  let expected:u32=talos_evolution_prototype::SAMPLE.iter().map(|v|u32::from(*v)).sum();
  anyhow::ensure!(out.completed && out.value==expected && out.bytes_released==talos_evolution_prototype::SAMPLE.len() && out.worker_terminated,"prototype observation mismatch");
  println!("{{\"schema\":\"talos.extension-prototype.v1\",\"actual_wasm_result\":{},\"broker_bytes_released\":{},\"worker_terminated\":true,\"product_ready\":false}}",out.value,out.bytes_released);
  Ok(())
 }
 #[cfg(not(all(windows,target_arch="x86_64")))]{anyhow::bail!("unsupported: OS integration is Windows x64 only; no fallback")}
}
