package ar.com.pctv.iptv;

import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "PcTv-StreamProxy";

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

            // Proxy nativo para streaming IPTV en Android TV: evade CORS, tokens y redirecciones 302
            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    if (uri != null) {
                        String path = uri.getPath();
                        if (path != null && path.startsWith("/api/stream-proxy")) {
                            if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
                                Map<String, String> optHeaders = new HashMap<>();
                                optHeaders.put("Access-Control-Allow-Origin", "*");
                                optHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                                optHeaders.put("Access-Control-Allow-Headers", "*");
                                return new WebResourceResponse("text/plain", "UTF-8", 200, "OK", optHeaders, new ByteArrayInputStream(new byte[0]));
                            }
                            String targetUrl = uri.getQueryParameter("url");
                            if (targetUrl != null && !targetUrl.isEmpty()) {
                                return handleStreamProxy(targetUrl);
                            }
                        }
                    }
                    return super.shouldInterceptRequest(view, request);
                }
            });
        }
    }

    /**
     * Descarga y retransmite señales IPTV de forma nativa en Java eliminando restricciones de CORS,
     * siguiendo redirecciones y reescribiendo listas .m3u8 para que el reproductor no se quede cargando.
     */
    private WebResourceResponse handleStreamProxy(String targetUrl) {
        HttpURLConnection conn = null;
        try {
            String currentUrl = targetUrl;
            int redirects = 0;
            int code = 0;

            // Manejo de redirecciones cruzadas (HTTP -> HTTPS y viceversa)
            while (redirects < 6) {
                URL url = new URL(currentUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(9000);
                conn.setReadTimeout(12000);
                conn.setRequestProperty(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                );
                conn.setRequestProperty("Accept", "*/*");
                conn.connect();

                code = conn.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = conn.getHeaderField("Location");
                    if (loc != null && !loc.isEmpty()) {
                        currentUrl = new URL(new URL(currentUrl), loc).toString();
                        conn.disconnect();
                        redirects++;
                        continue;
                    }
                }
                break;
            }

            final String finalUrl = currentUrl;
            String contentType = conn != null ? conn.getContentType() : null;

            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
            headers.put("Access-Control-Allow-Headers", "*");
            headers.put("Cache-Control", "no-cache");

            if (code >= 400) {
                return new WebResourceResponse("text/plain", "UTF-8", code, "Error", headers, new ByteArrayInputStream(("HTTP " + code).getBytes(StandardCharsets.UTF_8)));
            }

            // Identificar si la respuesta es una lista de reproducción HLS
            boolean isM3u8 = (contentType != null && (contentType.contains("mpegurl") || contentType.contains("application/vnd.apple.mpegurl") || contentType.contains("text/plain")))
                || targetUrl.contains(".m3u8")
                || finalUrl.contains(".m3u8");

            if (isM3u8) {
                InputStream in = conn.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;

                while ((line = reader.readLine()) != null) {
                    String trimmed = line.trim();
                    if (!trimmed.isEmpty()) {
                        if (trimmed.startsWith("#")) {
                            // Reescritura de llaves de cifrado AES o pistas de audio
                            if (trimmed.contains("URI=\"")) {
                                Pattern p = Pattern.compile("URI=\"([^\"]+)\"");
                                Matcher m = p.matcher(line);
                                StringBuffer lineBuf = new StringBuffer();
                                while (m.find()) {
                                    String keyUri = m.group(1);
                                    try {
                                        String absKeyUri = new URL(new URL(finalUrl), keyUri).toString();
                                        String proxiedKeyUri = "/api/stream-proxy?url=" + URLEncoder.encode(absKeyUri, "UTF-8");
                                        m.appendReplacement(lineBuf, "URI=\"" + Matcher.quoteReplacement(proxiedKeyUri) + "\"");
                                    } catch (Exception ex) {
                                        m.appendReplacement(lineBuf, m.group(0));
                                    }
                                }
                                m.appendTail(lineBuf);
                                line = lineBuf.toString();
                            }
                        } else {
                            // Si es una variante de resolución o un segmento de video
                            try {
                                String absSegmentUrl = new URL(new URL(finalUrl), trimmed).toString();
                                line = "/api/stream-proxy?url=" + URLEncoder.encode(absSegmentUrl, "UTF-8");
                            } catch (Exception ex) {
                                // Mantener original en caso de error
                            }
                        }
                    }
                    sb.append(line).append("\n");
                }
                reader.close();

                byte[] data = sb.toString().getBytes(StandardCharsets.UTF_8);
                return new WebResourceResponse("application/vnd.apple.mpegurl", "UTF-8", 200, "OK", headers, new ByteArrayInputStream(data));
            }

            // Para segmentos multimedia binarios (.ts, .aac, .m4s)
            String mime = (contentType != null && !contentType.isEmpty()) ? contentType.split(";")[0].trim() : "video/MP2T";
            return new WebResourceResponse(mime, null, 200, "OK", headers, conn.getInputStream());

        } catch (Exception e) {
            Log.e(TAG, "Error en proxy nativo para " + targetUrl, e);
            Map<String, String> errHeaders = new HashMap<>();
            errHeaders.put("Access-Control-Allow-Origin", "*");
            return new WebResourceResponse("text/plain", "UTF-8", 502, "Bad Gateway", errHeaders, new ByteArrayInputStream(("Proxy error: " + e.getMessage()).getBytes(StandardCharsets.UTF_8)));
        }
    }

    /**
     * Helper nativo expuesto a Javascript para comprobaciones de conectividad sin bloqueos de CORS.
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
