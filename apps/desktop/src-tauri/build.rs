fn main() {
    let target = std::env::var("TARGET").expect("Cargo TARGET is required");
    println!("cargo:rustc-env=EBOOK_READER_TARGET_TRIPLE={target}");
    tauri_build::build()
}
