const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "events.json");
const defaultDataFile = path.join(dataDir, "default-events.json");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

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

const EVENT_COLUMNS = [
  "id",
  "name",
  "startsAt",
  "venue",
  "status",
  "summary",
  "theme",
  "speakers",
  "owners",
  "lumaUrl",
  "lumaStatus",
  "lumaRegistrationCount",
  "lumaCheckedAt",
  "lumaNotes",
  "templateId",
  "notes",
  "runbookAttentionNotes",
  "runbookReceptionMemo",
  "runbookEmergencyMemo",
  "runbookParticipantMemoPlaceholder",
  "resultAttendeeCount",
  "resultImpression",
  "resultWentWell",
  "resultImprovements",
  "resultNextMemo",
  "resultContactNotes",
  "resultClosedAt",
  "participantSource",
  "participantImportStatus",
  "participantCheckedInCount",
  "participantLastImportedAt",
  "participantNotes",
  "financeMemo",
  "createdAt",
  "updatedAt",
  "tasksBlob",
  "timetableBlob",
  "rolesBlob",
  "checklistBlob",
  "participantsBlob",
  "financeLinesBlob"
];

async function ensureDataStore() {
  await fsp.mkdir(dataDir, { recursive: true });

  try {
    await fsp.access(dataFile, fs.constants.F_OK);
  } catch {
    await fsp.copyFile(defaultDataFile, dataFile);
  }
}

async function readEvents() {
  await ensureDataStore();
  const raw = await fsp.readFile(dataFile, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeEvents(events) {
  await ensureDataStore();

  if (!isValidEventsPayload(events)) {
    throw new Error("Events payload must be an array.");
  }

  const tempFile = `${dataFile}.tmp`;
  const body = `${JSON.stringify(events, null, 2)}\n`;
  await fsp.writeFile(tempFile, body, "utf8");
  await fsp.rename(tempFile, dataFile);

  return readEvents();
}

function isValidEventsPayload(events) {
  return Array.isArray(events) && events.every(isValidEventRecord);
}

function isValidEventRecord(event) {
  return (
    event &&
    typeof event === "object" &&
    !Array.isArray(event) &&
    typeof event.id === "string" &&
    typeof event.name !== "undefined" &&
    typeof event.runbook === "object" &&
    typeof event.result === "object" &&
    typeof event.finance === "object" &&
    typeof event.participantHub === "object" &&
    Array.isArray(event.tasks) &&
    Array.isArray(event.runbook?.timetable) &&
    Array.isArray(event.runbook?.roles) &&
    Array.isArray(event.runbook?.checklist) &&
    Array.isArray(event.participantHub?.touchedParticipants) &&
    Array.isArray(event.finance?.lines)
  );
}

async function resetEvents() {
  await ensureDataStore();
  await fsp.copyFile(defaultDataFile, dataFile);
  return readEvents();
}

function encodeNestedValue(value) {
  return encodeURIComponent(value == null ? "" : String(value));
}

function decodeNestedValue(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

function stringifyCsv(rows) {
  return `${rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          if (/[",\n\r]/.test(value)) {
            return `"${value.replaceAll('"', '""')}"`;
          }
          return value;
        })
        .join(",")
    )
    .join("\n")}\n`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((currentRow) => currentRow.some((value) => value !== ""));
}

function serializeCollection(items, fields, transforms = {}) {
  return (items || [])
    .map((item) =>
      fields
        .map((field) => {
          const transform = transforms[field];
          const value = transform ? transform(item?.[field], item) : item?.[field];
          return encodeNestedValue(value);
        })
        .join("|")
    )
    .join("\n");
}

function parseCollection(text, fields, transforms = {}) {
  if (!text) {
    return [];
  }

  return text
    .split("\n")
    .filter((row) => row !== "")
    .map((row) => {
      const values = row.split("|");
      return fields.reduce((item, field, index) => {
        const raw = decodeNestedValue(values[index] || "");
        const transform = transforms[field];
        item[field] = transform ? transform(raw) : raw;
        return item;
      }, {});
    });
}

function serializeEventRow(event) {
  return [
    event.id || "",
    event.name || "",
    event.startsAt || "",
    event.venue || "",
    event.status || "",
    event.summary || "",
    event.theme || "",
    event.speakers || "",
    event.owners || "",
    event.lumaUrl || "",
    event.lumaStatus || "",
    event.lumaRegistrationCount ?? "",
    event.lumaCheckedAt || "",
    event.lumaNotes || "",
    event.templateId || "",
    event.notes || "",
    event.runbook?.attentionNotes || "",
    event.runbook?.receptionMemo || "",
    event.runbook?.emergencyMemo || "",
    event.runbook?.participantMemoPlaceholder || "",
    event.result?.attendeeCount ?? "",
    event.result?.impression || "",
    event.result?.wentWell || "",
    event.result?.improvements || "",
    event.result?.nextMemo || "",
    event.result?.contactNotes || "",
    event.result?.closedAt || "",
    event.participantHub?.source || "",
    event.participantHub?.importStatus || "",
    event.participantHub?.checkedInCount ?? "",
    event.participantHub?.lastImportedAt || "",
    event.participantHub?.notes || "",
    event.finance?.memo || "",
    event.createdAt || "",
    event.updatedAt || "",
    serializeCollection(event.tasks, ["id", "title", "assignee", "dueDate", "status", "memo", "category"]),
    serializeCollection(event.runbook?.timetable, ["id", "time", "title", "owner", "note"]),
    serializeCollection(event.runbook?.roles, ["id", "role", "owner", "note"]),
    serializeCollection(event.runbook?.checklist, ["id", "label", "checked", "note"], {
      checked: (value) => (value ? "1" : "")
    }),
    serializeCollection(event.participantHub?.touchedParticipants, ["id", "name", "handle", "note", "followUp"], {
      followUp: (value) => (value ? "1" : "")
    }),
    serializeCollection(
      event.finance?.lines,
      ["id", "type", "category", "name", "plannedAmount", "actualAmount", "counterparty", "advanceBy", "settlementStatus", "memo"]
    )
  ];
}

function serializeEventsToCsv(events) {
  return stringifyCsv([EVENT_COLUMNS, ...events.map((event) => serializeEventRow(event))]);
}

function parseEventsCsv(text) {
  const rows = parseCsv(text);

  if (!rows.length) {
    return [];
  }

  const headers = rows[0];
  const headerIndex = headers.reduce((acc, header, index) => {
    acc[header] = index;
    return acc;
  }, {});

  const missing = EVENT_COLUMNS.filter((column) => typeof headerIndex[column] === "undefined");
  if (missing.length) {
    throw new Error(`CSV header is missing required columns: ${missing.join(", ")}`);
  }

  return rows.slice(1).map((row) => {
    const get = (column) => row[headerIndex[column]] || "";

    return {
      id: get("id"),
      name: get("name"),
      startsAt: get("startsAt"),
      venue: get("venue"),
      status: get("status"),
      summary: get("summary"),
      theme: get("theme"),
      speakers: get("speakers"),
      owners: get("owners"),
      lumaUrl: get("lumaUrl"),
      lumaStatus: get("lumaStatus"),
      lumaRegistrationCount: get("lumaRegistrationCount"),
      lumaCheckedAt: get("lumaCheckedAt"),
      lumaNotes: get("lumaNotes"),
      templateId: get("templateId"),
      notes: get("notes"),
      tasks: parseCollection(get("tasksBlob"), ["id", "title", "assignee", "dueDate", "status", "memo", "category"]),
      runbook: {
        timetable: parseCollection(get("timetableBlob"), ["id", "time", "title", "owner", "note"]),
        roles: parseCollection(get("rolesBlob"), ["id", "role", "owner", "note"]),
        attentionNotes: get("runbookAttentionNotes"),
        receptionMemo: get("runbookReceptionMemo"),
        emergencyMemo: get("runbookEmergencyMemo"),
        checklist: parseCollection(get("checklistBlob"), ["id", "label", "checked", "note"], {
          checked: (value) => value === "1" || value === "true"
        }),
        participantMemoPlaceholder: get("runbookParticipantMemoPlaceholder")
      },
      result: {
        attendeeCount: get("resultAttendeeCount"),
        impression: get("resultImpression"),
        wentWell: get("resultWentWell"),
        improvements: get("resultImprovements"),
        nextMemo: get("resultNextMemo"),
        contactNotes: get("resultContactNotes"),
        closedAt: get("resultClosedAt")
      },
      participantHub: {
        source: get("participantSource"),
        importStatus: get("participantImportStatus"),
        checkedInCount: get("participantCheckedInCount"),
        lastImportedAt: get("participantLastImportedAt"),
        notes: get("participantNotes"),
        touchedParticipants: parseCollection(get("participantsBlob"), ["id", "name", "handle", "note", "followUp"], {
          followUp: (value) => value === "1" || value === "true"
        })
      },
      finance: {
        memo: get("financeMemo"),
        lines: parseCollection(
          get("financeLinesBlob"),
          ["id", "type", "category", "name", "plannedAmount", "actualAmount", "counterparty", "advanceBy", "settlementStatus", "memo"],
          {
            plannedAmount: (value) => (value === "" ? "" : Number(value)),
            actualAmount: (value) => (value === "" ? "" : Number(value))
          }
        )
      },
      createdAt: get("createdAt"),
      updatedAt: get("updatedAt")
    };
  });
}

function safeResolve(urlPath) {
  const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
  const decoded = decodeURIComponent(cleanPath.split("?")[0]);
  const targetPath = path.normalize(path.join(publicDir, decoded));

  if (!targetPath.startsWith(publicDir)) {
    return null;
  }

  return targetPath;
}

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

function sendFile(filePath, res) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
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
    sendCsv(res, `event-ops-backup-${dateLabel}.csv`, serializeEventsToCsv(events));
    return true;
  }

  if (pathname === "/api/export-csv" && req.method === "POST") {
    const payload = await readJsonBody(req);

    if (!isValidEventsPayload(payload)) {
      sendJson(res, 400, { error: "Events payload must be an array." });
      return true;
    }

    sendCsv(res, "event-ops-export.csv", serializeEventsToCsv(payload));
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${host}:${port}`);

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
});

if (require.main === module) {
  server.listen(port, host, () => {
    console.log(`Event Hub is running at http://${host}:${port}`);
  });
}

module.exports = {
  parseEventsCsv,
  serializeEventsToCsv
};
