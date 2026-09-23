import { isRedirectUrl } from './urlResolver';

/**
 * Realiza un Health Check a una URL para comprobar su disponibilidad.
 * 
 * - Si es una transmisión de YouTube Live, devuelve 'online' inmediatamente.
 * - Si estamos en Android / Smart TV, invoca AndroidStreamHelper.checkHealth de Java nativo.
 * - Si estamos en Tauri nativo, invoca el comando Rust sin restricciones de origen.
 * - Si estamos en localhost, utiliza /api/stream-proxy.
 * - Para flujos directos, realiza un fetch con timeout de 5 segundos.
 */
export async function checkChannelHealth(url) {
  if (!url) return 'offline';

  // Canales en YouTube Live
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'online';
  }

  // Si estamos en la app nativa de Android / Smart TV
  if (
    typeof window !== 'undefined' &&
    window.AndroidStreamHelper &&
    typeof window.AndroidStreamHelper.checkHealth === 'function'
  ) {
    try {
      const isOnline = window.AndroidStreamHelper.checkHealth(url);
      return isOnline ? 'online' : 'offline';
    } catch {
      // Fallback a fetch si ocurre error
    }
  }

  // Si estamos en Tauri nativo, intentamos usar el backend en Rust para evitar CORS
  try {
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core');
      const isOnline = await invoke('check_channel_health', { url });
      return isOnline ? 'online' : 'offline';
    }
  } catch {
    // Si no está disponible el comando Rust, continúa con el fetch del frontend
  }

  // Si es un redireccionador o flujo dinámico y estamos en entorno local, usamos el stream-proxy
  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  const targetUrl =
    isLocalDev && isRedirectUrl(url)
      ? `/api/stream-proxy?url=${encodeURIComponent(url)}`
      : url;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return 'online';
    }
    return 'offline';
  } catch {
    return 'offline';
  }
}
