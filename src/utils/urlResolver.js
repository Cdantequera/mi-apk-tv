/**
 * Utilidades para detección y resolución de URLs con redirecciones dinámicas
 * y bloqueos de CORS (por ejemplo, enlaces de Pluto TV que usan el dominio jmp2.uk o stitcher-ipv4).
 */

/**
 * Determina si una URL pertenece a un acortador, redireccionador dinámico o proveedor
 * con restricciones estrictas de CORS como Pluto TV.
 */
/**
 * Determina si una URL pertenece a un acortador, redireccionador dinámico, Cloudflare Worker
 * o proveedor con restricciones estrictas de CORS (como Pluto TV o AWS IVS).
 */
export function isRedirectUrl(url) {
  if (!url) return false;
  return (
    url.includes('jmp2.uk') ||
    url.includes('pluto.tv') ||
    url.includes('stitcher') ||
    url.includes('workers.dev') ||
    url.includes('pages.dev') ||
    url.includes('slivcdn') ||
    url.includes('short.gy') ||
    url.includes('tinyurl.com') ||
    url.includes('bit.ly') ||
    url.includes('pls.link') ||
    url.includes('live-video.net') ||
    url.includes('kick.com')
  );
}

/**
 * Resuelve y adapta la URL de streaming para evadir bloqueos de CORS y redirecciones 302.
 * 
 * - En la app Android APK en TV (donde MainActivity maneja /api/stream-proxy de forma nativa)
 *   o en entorno de desarrollo local (localhost), enruta la solicitud a través del endpoint /api/stream-proxy.
 * - Si estamos en Tauri Desktop nativo, invoca resolver_url_redireccion en Rust.
 * 
 * @param {string} url - URL original del canal IPTV (.m3u8 o acortador)
 * @returns {Promise<string>} - URL accesible por el reproductor HLS
 */
export async function resolveStreamUrl(url) {
  if (!url) return url;

  // Si no requiere resolución especial, reproducir directamente
  if (!isRedirectUrl(url)) {
    return url;
  }

  // En Android TV (APK) o en entorno de desarrollo PC (localhost)
  const canUseNativeOrDevProxy =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      typeof window.AndroidStreamHelper !== 'undefined');

  if (canUseNativeOrDevProxy) {
    return `/api/stream-proxy?url=${encodeURIComponent(url)}`;
  }

  // Si estamos en Tauri Desktop nativo
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const finalUrl = await invoke('resolver_url_redireccion', { url });
      return finalUrl;
    } catch (err) {
      console.error('[urlResolver] Error resolviendo redirección en Rust:', err);
      throw err;
    }
  }

  // Fallback directo
  return url;
}
