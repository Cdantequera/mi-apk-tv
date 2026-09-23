import { Buffer } from 'node:buffer';
import https from 'node:https';
import http from 'node:http';

/**
 * Cliente HTTP nativo con soporte de redirecciones (301/302/307),
 * bypass de TLS no estricto y omisión de cabecera Origin restrictiva.
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
          // Manejo de redirecciones HTTP
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
      req.setTimeout(12000, () => {
        req.destroy(new Error('Request timeout after 12s'));
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Serverless function para Vercel que actúa como proxy HLS (.m3u8 y segmentos .ts)
 * eliminando restricciones de CORS y resolviendo contenido mixto (HTTP en HTTPS).
 */
export default async function handler(req, res) {
  // Cabeceras permisivas de CORS para el reproductor
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let targetUrl = req.query.url;
  // Si la URL contiene múltiples parámetros y el query parser solo tomó el primero,
  // extraer la URL completa a partir de req.url
  if (req.url && req.url.includes('url=')) {
    const rawParam = req.url.substring(req.url.indexOf('url=') + 4);
    try {
      targetUrl = decodeURIComponent(rawParam);
    } catch {
      targetUrl = rawParam;
    }
  }

  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const response = await fetchStream(targetUrl);
    if (!response.ok) {
      return res.status(response.status).send(`Upstream server returned error ${response.status}`);
    }

    const finalBaseUrl = response.url;
    const buffer = response.buffer;
    const preview = buffer.subarray(0, 64).toString('utf-8');

    // Si es una lista de reproducción HLS (.m3u8)
    if (preview.includes('#EXTM3U')) {
      const text = buffer.toString('utf-8');
      const lines = text.split('\n');
      const rewritten = lines
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          // Reescritura de llaves AES o subtítulos URI="..."
          if (trimmed.startsWith('#')) {
            if (trimmed.includes('URI="')) {
              return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                try {
                  const abs = new URL(uri, finalBaseUrl).href;
                  return `URI="/api/stream-proxy?url=${encodeURIComponent(abs)}"`;
                } catch {
                  return match;
                }
              });
            }
            return line;
          }

          // Variantes de lista o segmentos de video
          try {
            const abs = new URL(trimmed, finalBaseUrl).href;
            return `/api/stream-proxy?url=${encodeURIComponent(abs)}`;
          } catch {
            return line;
          }
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(200).send(rewritten);
    }

    // Segmentos binarios (.ts, .key, etc.)
    res.setHeader(
      'Content-Type',
      response.headers['content-type'] || 'video/MP2T'
    );
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(502).send('Proxy error: ' + (err.message || 'Unknown'));
  }
}
