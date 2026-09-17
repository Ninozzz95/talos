//! Test-only executable selected by the fault-injection Cargo feature.
#![cfg_attr(windows,windows_subsystem="windows")]
fn main()->anyhow::Result<()> {
    #[cfg(all(windows,target_arch="x86_64"))] {
        let args:Vec<_>=std::env::args_os().skip(1).collect();
        if args.len()==3 && args[0]=="--serve" {
            let parent=args[2].to_str().ok_or_else(||anyhow::anyhow!("fixture PID"))?.parse()?;
            return talos_evolution_prototype::windows::testing::fault_worker(&args[1],parent);
        }
        if args.len()==2 && args[0]=="--supervisor-crash-fixture" {
            return talos_evolution_prototype::windows::testing::supervisor_crash_fixture(std::path::Path::new(&args[1]));
        }
        anyhow::bail!("explicit lifecycle test fixture entry required")
    }
    #[cfg(not(all(windows,target_arch="x86_64")))] anyhow::bail!("Windows x64 lifecycle fixtures only")
}
