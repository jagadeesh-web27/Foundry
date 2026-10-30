fn main() {
  // The web UI in ../dist is compiled into the binary by `generate_context!`, but tauri_build only
  // asks Cargo to watch the config files. Without this, a frontend-only change produced an app that
  // silently shipped the previous UI.
  println!("cargo:rerun-if-changed=../dist");
  tauri_build::build()
}
