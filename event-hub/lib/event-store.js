const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const dataFile = path.join(dataDir, "events.json");
const defaultDataFile = path.join(dataDir, "default-events.json");

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
  "imageDriveFolderUrl",
  "imageArchiveNotes",
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
  "financeLinesBlob",
  "imageLinksBlob"
];

function getSessionInfo() {
  return {
    authRequired: false,
    backendLabel: "Local JSON / Node",
    user: null,
    isAllowed: true
  };
}

async function ensureDataStore() {
  await fsp.mkdir(dataDir, { recursive: true });

  try {
    await fsp.access(dataFile, fs.constants.F_OK);
  } catch {
    await fsp.copyFile(defaultDataFile, dataFile);
  }
}

async function readSeedEvents() {
  const raw = await fsp.readFile(defaultDataFile, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
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

async function resetEvents() {
  await ensureDataStore();
  const seedEvents = await readSeedEvents();
  await fsp.writeFile(dataFile, `${JSON.stringify(seedEvents, null, 2)}\n`, "utf8");
  return seedEvents;
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
    typeof event.assetArchive === "object" &&
    Array.isArray(event.tasks) &&
    Array.isArray(event.runbook?.timetable) &&
    Array.isArray(event.runbook?.roles) &&
    Array.isArray(event.runbook?.checklist) &&
    Array.isArray(event.participantHub?.touchedParticipants) &&
    Array.isArray(event.finance?.lines) &&
    Array.isArray(event.assetArchive?.images)
  );
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
    event.assetArchive?.driveFolderUrl || "",
    event.assetArchive?.notes || "",
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
    ),
    serializeCollection(event.assetArchive?.images, ["id", "label", "url", "note"])
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
      assetArchive: {
        driveFolderUrl: get("imageDriveFolderUrl"),
        notes: get("imageArchiveNotes"),
        images: parseCollection(get("imageLinksBlob"), ["id", "label", "url", "note"])
      },
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

module.exports = {
  getSessionInfo,
  isValidEventsPayload,
  parseEventsCsv,
  readEvents,
  resetEvents,
  serializeEventsToCsv,
  writeEvents
};
