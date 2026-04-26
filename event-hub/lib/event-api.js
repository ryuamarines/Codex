const { getSessionInfo, isValidEventsPayload, parseEventsCsv, readEvents, resetEvents, serializeEventsToCsv, writeEvents } = require("./event-store");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sendCsv(res, filename, content) {
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(content);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 5 * 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/session" && req.method === "GET") {
    sendJson(res, 200, getSessionInfo());
    return true;
  }

  if (pathname === "/api/events" && req.method === "GET") {
    const events = await readEvents();
    sendJson(res, 200, events);
    return true;
  }

  if (pathname === "/api/events" && req.method === "PUT") {
    const payload = await readJsonBody(req);
    if (!isValidEventsPayload(payload)) {
      sendJson(res, 400, { error: "Events payload must be an array." });
      return true;
    }

    const events = await writeEvents(payload);
    sendJson(res, 200, events);

    return true;
  }

  if (pathname === "/api/export-csv" && req.method === "GET") {
    const events = await readEvents();
    const dateLabel = new Date().toISOString().slice(0, 10);
    sendCsv(res, `event-hub-backup-${dateLabel}.csv`, serializeEventsToCsv(events));
    return true;
  }

  if (pathname === "/api/export-csv" && req.method === "POST") {
    const payload = await readJsonBody(req);

    if (!isValidEventsPayload(payload)) {
      sendJson(res, 400, { error: "Events payload must be an array." });
      return true;
    }

    sendCsv(res, "event-hub-export.csv", serializeEventsToCsv(payload));
    return true;
  }

  if (pathname === "/api/import-csv" && req.method === "POST") {
    const csvText = await readRawBody(req);

    if (!csvText.trim()) {
      sendJson(res, 400, { error: "CSV body is empty." });
      return true;
    }

    const parsedEvents = parseEventsCsv(csvText);
    if (!isValidEventsPayload(parsedEvents)) {
      sendJson(res, 400, { error: "CSV content is not a valid events export." });
      return true;
    }

    if (req.headers["x-import-mode"] === "parse-only") {
      sendJson(res, 200, parsedEvents);
      return true;
    }

    const events = await writeEvents(parsedEvents);
    sendJson(res, 200, events);

    return true;
  }

  if (pathname === "/api/reset" && req.method === "POST") {
    const events = await resetEvents();
    sendJson(res, 200, events);

    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendText(res, 404, "API route not found");
    return true;
  }

  return false;
}

module.exports = {
  handleApi
};
