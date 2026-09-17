pub mod authority;
pub mod engine;
pub mod wire;
#[cfg(all(windows, target_arch = "x86_64"))]
pub mod windows;

pub fn digest(bytes: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes).into()
}
pub fn random_id() -> anyhow::Result<[u8; 16]> {
    let mut value = [0; 16];
    getrandom::fill(&mut value).map_err(|_| anyhow::anyhow!("OS entropy unavailable"))?;
    anyhow::ensure!(value != [0; 16], "invalid random identifier");
    Ok(value)
}
pub const SAMPLE: &[u8] = b"TODO: mediated snapshot\nFIXME: no ambient access\n";
pub const COMPONENT: &str = include_str!("../fixtures/sum.wat");
