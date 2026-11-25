import { Hono } from 'hono'

const player = new Hono()

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Stream Player</title>
  <style>
    html, body { margin: 0; padding: 0; background: #000; color: #ddd; font-family: system-ui, sans-serif; }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 16px; }
    .status { font-size: 13px; opacity: 0.8; margin: 8px 0; min-height: 18px; }
    video { width: 100%; height: auto; background: #000; aspect-ratio: 16/9; }
    .row { display: flex; gap: 8px; margin-top: 12px; }
    input[type=text] { flex: 1; padding: 8px 10px; background: #111; color: #eee; border: 1px solid #333; font-family: ui-monospace, monospace; font-size: 12px; }
    button { padding: 8px 18px; background: #c0392b; color: #fff; border: 0; cursor: pointer; font-weight: 600; }
    button:hover { background: #e74c3c; }
    h1 { font-size: 15px; margin: 0 0 12px; opacity: 0.6; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>HLS Stream Player</h1>
    <video id="v" controls crossorigin="anonymous" playsinline></video>
    <div class="status" id="status">Paste a streamUrl from /stream/&lt;tmdbId&gt; and hit Play.</div>
    <div class="row">
      <input type="text" id="src" placeholder="https://e2e.majorplay.net/v/.../config-xxx.json?...">
      <button id="go">Play</button>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
  <script>
    const API_BASE = location.origin;
    const video = document.getElementById('v');
    const input = document.getElementById('src');
    const statusEl = document.getElementById('status');
    let hls = null;

    function setStatus(s) { statusEl.textContent = s; }
    function proxied(u) { return API_BASE + '/stream/proxy?url=' + encodeURIComponent(u); }

    function play(rawUrl) {
      if (hls) { hls.destroy(); hls = null; }
      const src = proxied(rawUrl);
      setStatus('Loading manifest…');

      if (window.Hls && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { setStatus('Manifest parsed, starting playback'); video.play().catch((e) => setStatus('autoplay blocked: ' + e.message)); });
        hls.on(Hls.Events.LEVEL_LOADED, (_e, d) => setStatus('Level loaded: ' + d.details.totalduration.toFixed(0) + 's duration'));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          console.error('hls error', data);
          if (data.fatal) setStatus('Fatal error: ' + data.type + ' / ' + data.details + (data.response ? ' [HTTP ' + data.response.code + ']' : ''));
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
      } else {
        setStatus('HLS not supported in this browser.');
      }
    }

    document.getElementById('go').addEventListener('click', () => {
      const v = input.value.trim();
      if (v) play(v);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('go').click(); });

    const qs = new URLSearchParams(location.search);
    const auto = qs.get('src');
    if (auto) { input.value = auto; play(auto); }
  </script>
</body>
</html>`

player.get('/player', (c) => c.html(HTML))

export default player
