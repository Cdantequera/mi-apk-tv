package ar.com.pctv.iptv;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Mantener la pantalla del televisor encendida durante la reproducción de TV
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Configuración avanzada de WebView para streaming IPTV sin restricciones
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            // Permitir contenido mixto (HTTP y HTTPS) indispensable para canales IPTV
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            // Permitir auto-reproducción de video sin interacción táctil física (ideal para Smart TV)
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);

            // Inyectar interfaz nativa de Java para resolución de URLs y Health Checks
            webView.addJavascriptInterface(new AndroidStreamHelper(), "AndroidStreamHelper");
        }
    }

    /**
     * Helper nativo expuesto a Javascript para resolver redirecciones HTTP 302/301
     * y realizar comprobaciones de conectividad sin bloqueos de CORS del navegador.
     */
    public static class AndroidStreamHelper {

        @JavascriptInterface
        public String resolveUrl(String inputUrl) {
            if (inputUrl == null || inputUrl.isEmpty()) {
                return inputUrl;
            }
            try {
                URL url = new URL(inputUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setRequestProperty(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                );
                conn.connect();

                int code = conn.getResponseCode();
                String finalUrl = conn.getURL().toString();
                conn.disconnect();
                return finalUrl;
            } catch (Exception e) {
                return inputUrl;
            }
        }

        @JavascriptInterface
        public boolean checkHealth(String inputUrl) {
            if (inputUrl == null || inputUrl.isEmpty()) {
                return false;
            }
            try {
                URL url = new URL(inputUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setRequestProperty(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                );
                conn.connect();
                int code = conn.getResponseCode();
                conn.disconnect();
                return code >= 200 && code < 400;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean isAndroidTv() {
            return true;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // En Smart TV, el botón de retroceso (BACK) debe avisar a la aplicación React
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('tv_back_button'));",
                    null
                );
                return true; // Consumido por la app
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
