/**
 * Detección unificada de Smart TV, Android TV y entorno APK (Capacitor)
 */
export function isTvDevice() {
  if (typeof window === 'undefined') return false;

  // 1. Interfaz nativa AndroidStreamHelper inyectada en MainActivity (Android TV / APK)
  if (typeof window.AndroidStreamHelper !== 'undefined') return true;

  // 2. Capacitor ejecutándose en Android APK
  if (window.Capacitor?.getPlatform?.() === 'android' || window.Capacitor?.isNativePlatform?.()) {
    return true;
  }

  // 3. User Agent característico de Android TV, Smart TV, Fire TV, Google TV, etc.
  const ua = (navigator.userAgent || '').toLowerCase();
  return (
    ua.includes('android') ||
    ua.includes('smart-tv') ||
    ua.includes('smarttv') ||
    ua.includes('googletv') ||
    ua.includes('appletv') ||
    ua.includes('hbbtv') ||
    ua.includes('aft') || // Amazon Fire TV
    ua.includes('tizen') ||
    ua.includes('webos') ||
    ua.includes('viera') ||
    ua.includes('netcast') ||
    ua.includes('tv')
  );
}
