import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = Number(process.env.PORT || 8000);
const root = path.dirname(fileURLToPath(import.meta.url));
const transitFeedUrl = "https://www.wegotransit.com/GoogleExport/google_transit.zip";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/wego-gtfs") {
    await proxyTransitFeed(response);
    return;
  }

  await serveStatic(url.pathname, response);
});

server.listen(port, host, () => {
  console.log(`Dev server running at http://${host}:${port}`);
});

async function proxyTransitFeed(response) {
  try {
    const upstream = await fetch(transitFeedUrl, { redirect: "follow" });

    if (!upstream.ok) {
      response.writeHead(upstream.status, corsHeaders({
        "content-type": "text/plain; charset=utf-8",
      }));
      response.end(`Transit proxy failed with ${upstream.status}`);
      return;
    }

    const arrayBuffer = await upstream.arrayBuffer();
    response.writeHead(200, corsHeaders({
      "content-type": upstream.headers.get("content-type") || "application/zip",
      "cache-control": "public, max-age=900",
    }));
    response.end(Buffer.from(arrayBuffer));
  } catch (error) {
    response.writeHead(502, corsHeaders({
      "content-type": "text/plain; charset=utf-8",
    }));
    response.end(`Transit proxy failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

async function serveStatic(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const relativePath = path.normalize(safePath).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
  const filePath = path.join(root, relativePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath);
  const contentType = mimeTypes[extension] || "application/octet-stream";

  if (extension === ".html") {
    const html = await readFile(filePath);
    response.writeHead(200, { "content-type": contentType });
    response.end(html);
    return;
  }

  response.writeHead(200, { "content-type": contentType });
  createReadStream(filePath).pipe(response);
}

function corsHeaders(headers) {
  return {
    ...headers,
    "access-control-allow-origin": "*",
  };
}
