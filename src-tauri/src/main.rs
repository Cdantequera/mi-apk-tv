// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::time::Duration;
use reqwest::redirect::Policy;

/// Health Check para probar conectividad rápida a una URL
#[tauri::command]
async fn check_channel_health(url: String) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(4))
        .danger_accept_invalid_certs(true)
        .build();

    match client {
        Ok(c) => match c.get(&url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        },
        Err(_) => false,
    }
}

/// Resuelve redirecciones dinámicas (como jmp2.uk de Pluto TV o acortadores)
/// siguiendo los saltos HTTP 301/302 y devolviendo la URL final con el token de sesión.
#[tauri::command]
async fn resolver_url_redireccion(url: String) -> Result<String, String> {
    // Cliente reqwest con política de redirección (hasta 10 saltos) y User-Agent estándar de navegador
    let client = reqwest::Client::builder()
        .redirect(Policy::limited(10))
        .timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {}", e))?;

    // Realizamos la petición GET para que el servidor de streaming (ej. Pluto TV Stitcher)
    // procese la redirección completa y genere los parámetros de sesión y authToken
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Error resolviendo redirección para {}: {}", url, e))?;

    if !response.status().is_success() {
        return Err(format!("El servidor respondió con código de error {}", response.status()));
    }

    // URL final después de seguir todas las redirecciones HTTP 302/301/307
    let final_url = response.url().to_string();
    Ok(final_url)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_channel_health,
            resolver_url_redireccion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
