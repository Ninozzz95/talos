#![cfg_attr(windows,windows_subsystem="windows")]
fn main(){
 #[cfg(all(windows,target_arch="x86_64"))]{
  let args:Vec<_>=std::env::args_os().skip(1).collect();
  let result=(||->anyhow::Result<()>{anyhow::ensure!(args.len()==3 && args[0]=="--serve","prototype worker entry only");
   let parent=args[2].to_str().ok_or_else(||anyhow::anyhow!("invalid parent"))?.parse::<u32>()?;
   talos_evolution_prototype::windows::worker(&args[1],parent)})();
  if result.is_err(){std::process::exit(64);}
 }
 #[cfg(not(all(windows,target_arch="x86_64")))]std::process::exit(2);
}
