// Prints the default max_results: which value the code applies
#[test]
fn rc_probe() {
    let value = notes::config::load(&std::collections::HashMap::new(), None)
        .map(|c| c.max_results.to_string())
        .unwrap_or_else(|_| "error".to_string());
    println!("RC_PROBE={value}");
}
