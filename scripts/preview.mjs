// npm run preview: serves dist/ on http://127.0.0.1:4173 (PORT to change),
// with byte ranges so videos seek and loop as they will on the host.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fail, fromRoot } from "./lib.mjs";

const dist = fromRoot("dist");
if (!existsSync(join(dist, "index.html"))) fail("dist/index.html is missing: run `npm run build` first");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".webm": "video/webm", ".txt": "text/plain; charset=utf-8",
};

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let file = normalize(join(dist, path));
  if (!file.startsWith(dist + sep) && file !== dist) return send(response, 403);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return send(response, 404);
  const size = statSync(file).size;
  const headers = { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start < 0) return send(response, 416, { "Content-Range": `bytes */${size}` });
    response.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    return request.method === "HEAD" ? response.end() : createReadStream(file, { start, end }).pipe(response);
  }
  response.writeHead(200, { ...headers, "Content-Length": size });
  return request.method === "HEAD" ? response.end() : createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`serving dist/ at http://127.0.0.1:${port}/ (Ctrl+C to stop)`));

function send(response, status, headers = {}) {
  response.writeHead(status, { "Content-Type": "text/plain", ...headers });
  response.end(String(status));
}
