fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Compiler provisioning is separate from candidate execution.
    std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path()?);
    prost_build::Config::new().compile_protos(&["contracts/evolution.proto", "contracts/dev_bridge.proto"], &["contracts"])?;
    println!("cargo:rerun-if-changed=contracts/evolution.proto");
    println!("cargo:rerun-if-changed=contracts/dev_bridge.proto");
    Ok(())
}
