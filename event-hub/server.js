const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const { handleApi } = require("./lib/event-api");
const { parseEventsCsv, serializeEventsToCsv } = require("./lib/event-store");
const firebaseAuthHost = "event-hub-feb37.firebaseapp.com";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

function safeResolve(urlPath) {
  const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
  const decoded = decodeURIComponent(cleanPath.split("?")[0]);
  const targetPath = path.normalize(path.join(publicDir, decoded));

  if (!targetPath.startsWith(publicDir)) {
    return null;
  }

  return targetPath;
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sendFile(filePath, res) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function proxyFirebaseAuthRequest(req, res, url) {
  const targetPath = `${url.pathname}${url.search || ""}`;
  const headers = {
    ...req.headers,
    host: firebaseAuthHost
  };

  delete headers["x-forwarded-host"];
  delete headers["x-forwarded-proto"];

  const proxyReq = https.request(
    {
      hostname: firebaseAuthHost,
      path: targetPath,
      method: req.method,
      headers
    },
    (proxyRes) => {
      const responseHeaders = {
        ...proxyRes.headers,
        "Cache-Control": "no-store"
      };

      delete responseHeaders["content-security-policy"];
      res.writeHead(proxyRes.statusCode || 502, responseHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (error) => {
    console.error("Firebase auth proxy failed", error);
    sendText(res, 502, "Firebase auth proxy failed");
  });

  req.pipe(proxyReq);
}

async function requestHandler(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${host}:${port}`);

    if (url.pathname.startsWith("/__/auth/") || url.pathname === "/__/firebase/init.json") {
      proxyFirebaseAuthRequest(req, res, url);
      return;
    }

    if (await handleApi(req, res, url.pathname)) {
      return;
    }

    const resolved = safeResolve(url.pathname);

    if (!resolved) {
      sendText(res, 400, "Bad request");
      return;
    }

    fs.stat(resolved, (error, stat) => {
      if (!error && stat.isFile()) {
        sendFile(resolved, res);
        return;
      }

      sendFile(path.join(publicDir, "index.html"), res);
    });
  } catch (error) {
    console.error(error);
    sendText(res, 500, error.message || "Internal server error");
  }
}

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`Event Hub is running at http://${host}:${port}`);
  });
}

module.exports = requestHandler;
module.exports.server = server;
module.exports.parseEventsCsv = parseEventsCsv;
module.exports.serializeEventsToCsv = serializeEventsToCsv;
