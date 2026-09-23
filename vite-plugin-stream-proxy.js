import { Buffer } from 'node:buffer';
import https from 'node:https';
import http from 'node:http';

/**
 * Cliente HTTP nativo con soporte completo de redirecciones (301/302/307),
 * TLS renegotiation y omisión de cabecera Origin restrictiva.
 */
function fetchStream(url, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    try {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
          },
          rejectUnauthorized: false,
        },
        (res) => {
          // Manejo de redirección
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            const nextUrl = new URL(res.headers.location, url).href;
            return resolve(fetchStream(nextUrl, maxRedirects - 1));
          }

          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            resolve({
              ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
              status: res.statusCode || 500,
              url: url,
              headers: res.headers,
              buffer: buf,
            });
          });
        }
      );

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy(new Error('Request timeout after 10s'));
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Vite plugin que actúa como proxy y reescritor de listas de reproducción HLS (.m3u8)
 * para flujos dinámicos con redirecciones (como Pluto TV vía jmp2.uk o Cloudflare workers).
 */
export function streamProxyPlugin() {
  return {
    name: 'stream-proxy-plugin',
    configureServer(server) {
      server.middlewares.use('/api/stream-proxy', async (req, res, next) => {
        // Cabeceras de CORS permisivas
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          return res.end();
        }

        try {
          const reqUrl = new URL(req.url, 'http://localhost');
          const targetUrl = reqUrl.searchParams.get('url');

          if (!targetUrl) {
            res.statusCode = 400;
            return res.end('Missing url parameter');
          }

          const response = await fetchStream(targetUrl);

          if (!response.ok) {
            res.statusCode = response.status;
            return res.end(`Upstream server returned error ${response.status}`);
          }

          const finalBaseUrl = response.url;
          const buffer = response.buffer;
          const preview = buffer.subarray(0, 64).toString('utf-8');

          // Si es una lista HLS (#EXTM3U)
          if (preview.includes('#EXTM3U')) {
            const text = buffer.toString('utf-8');
            const lines = text.split('\n');
            const rewritten = lines
              .map((line) => {
                const trimmed = line.trim();
                if (!trimmed) return line;

                // Reescritura de etiquetas HLS con URI="..." (subtítulos, audio, llaves AES)
                if (trimmed.startsWith('#')) {
                  return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                    try {
                      const abs = new URL(uri, finalBaseUrl).href;
                      return `URI="/api/stream-proxy?url=${encodeURIComponent(abs)}"`;
                    } catch {
                      return match;
                    }
                  });
                }

                // Si la línea es una variante o lista de reproducción .m3u8
                if (
                  trimmed.includes('.m3u8') ||
                  trimmed.includes('/playlist') ||
                  trimmed.includes('/manifest')
                ) {
                  try {
                    const abs = new URL(trimmed, finalBaseUrl).href;
                    return `/api/stream-proxy?url=${encodeURIComponent(abs)}`;
                  } catch {
                    return line;
                  }
                }

                // Para segmentos multimedia:
                // Si la URL es relativa, la convertimos a absoluta en el CDN original.
                try {
                  return new URL(trimmed, finalBaseUrl).href;
                } catch {
                  return line;
                }
              })
              .join('\n');

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.end(rewritten);
          }

          // Si no es lista M3U (ej. llaves criptográficas .key binarias), enviamos el Buffer intacto
          res.setHeader(
            'Content-Type',
            response.headers['content-type'] || 'application/octet-stream'
          );
          return res.end(buffer);
        } catch (err) {
          console.error('[stream-proxy] Error:', err);
          res.statusCode = 502;
          return res.end('Proxy error: ' + (err.message || 'Unknown'));
        }
      });
    },
  };
}
