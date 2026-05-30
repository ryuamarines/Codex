import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { buildHealthSnapshot, buildResultCompleteness } from "../public/src/event-insights.js";
import { parseEventsCsv as parseBrowserCsv, serializeEventsToCsv as serializeBrowserCsv } from "../public/src/csv-transfer.js";
import { buildScheduleStatus, getFilteredFinanceLines, matchesCurrentPrepFilters } from "../public/src/event-selectors.js";
import { createEmptyEvent } from "../public/src/models.js";
import { validateEntity, validateEventCore } from "../public/src/validation.js";

const require = createRequire(import.meta.url);
const { parseEventsCsv, serializeEventsToCsv } = require("../server.js");
const { handleApi } = require("../lib/event-api.js");

const event = createEmptyEvent({ withTemplateTasks: false });
event.name = "Smoke Event";
event.startsAt = "2099-05-20T19:00";
event.venue = "Test Venue";
event.owners = "Ryu";
event.members.push({
  id: "member_1",
  name: "Miki",
  role: "受付",
  note: "当日受付リード"
});
event.result.impression = "よかった";
event.assetArchive.driveFolderUrl = "https://drive.google.com/drive/folders/example";
event.assetArchive.notes = "イベント写真";
event.assetArchive.images.push({
  id: "asset_1",
  label: "当日写真アルバム",
  url: "https://drive.google.com/file/d/example/view",
  note: "広報共有用"
});
event.runbook.timetable.push({ id: "time_1", time: "19:00", title: "開場", owner: "受付", note: "" });
event.runbook.roles.push({ id: "role_1", role: "受付", owner: "Ryu", note: "" });
event.runbook.checklist.push({ id: "check_1", label: "音響確認", checked: false, note: "" });
event.participantHub.attendees.push({
  id: "attendee_1",
  guestId: "guest_1",
  name: "Test Guest",
  email: "guest@example.com",
  approvalStatus: "approved",
  checkedInAt: "2099-05-20T10:00:00.000Z",
  organization: "Test Org",
  businessCardUrl: "https://example.com/card",
  crmTags: "VIP、次回招待",
  followUpAt: "2099-05-21",
  followUpNote: "お礼を送る",
  followUpDone: false
});
event.finance.lines.push({
  id: "line_1",
  type: "支出",
  category: "会場費",
  name: "会場費",
  plannedAmount: 10000,
  actualAmount: 10000,
  counterparty: "Venue",
  advanceBy: "",
  settlementStatus: "精算済み",
  memo: ""
});
event.tasks.push({
  id: "task_1",
  title: "会場確認",
  assignee: "Ryu",
  dueDate: "2099-05-18",
  status: "進行中",
  memo: "",
  category: "会場"
});

assert.doesNotThrow(() => validateEventCore(event));
assert.doesNotThrow(() =>
  validateEntity("finance", {
    type: "支出",
    category: "会場費",
    name: "会場費",
    plannedAmount: 1000,
    actualAmount: 1000
  })
);
assert.throws(() => validateEntity("timeline", { title: "開場", time: "" }));

const health = buildHealthSnapshot(event);
assert.equal(health.score, 5);

const schedule = buildScheduleStatus(event);
assert.equal(schedule.shortLabel.startsWith("あと") || schedule.shortLabel === "本日", true);

const filteredPrep = event.tasks.filter((task) =>
  matchesCurrentPrepFilters(task, { prepFilter: "open", prepAssigneeFilter: "Ryu" })
);
assert.equal(filteredPrep.length, 1);

const filteredFinance = getFilteredFinanceLines(event.finance.lines, "支出");
assert.equal(filteredFinance.length, 1);

const resultCompleteness = buildResultCompleteness(event);
assert.equal(resultCompleteness.score >= 1, true);

const csv = serializeEventsToCsv([event]);
const roundTrip = parseEventsCsv(csv);
assert.equal(roundTrip.length, 1);
assert.equal(roundTrip[0].name, event.name);
assert.equal(roundTrip[0].tasks[0].title, event.tasks[0].title);
assert.equal(roundTrip[0].members[0].name, event.members[0].name);
assert.equal(roundTrip[0].runbook.timetable[0].title, event.runbook.timetable[0].title);
assert.equal(roundTrip[0].finance.lines[0].plannedAmount, event.finance.lines[0].plannedAmount);
assert.equal(roundTrip[0].participantHub.attendees[0].email, event.participantHub.attendees[0].email);
assert.equal(roundTrip[0].participantHub.attendees[0].crmTags, event.participantHub.attendees[0].crmTags);
assert.equal(roundTrip[0].assetArchive.images[0].label, event.assetArchive.images[0].label);

const browserCsv = serializeBrowserCsv([event]);
const browserRoundTrip = parseBrowserCsv(browserCsv);
assert.equal(browserRoundTrip.length, 1);
assert.equal(browserRoundTrip[0].members[0].role, event.members[0].role);
assert.equal(browserRoundTrip[0].participantHub.attendees[0].businessCardUrl, event.participantHub.attendees[0].businessCardUrl);
assert.equal(browserRoundTrip[0].participantHub.attendees[0].followUpAt, event.participantHub.attendees[0].followUpAt);
assert.equal(browserRoundTrip[0].assetArchive.images[0].label, event.assetArchive.images[0].label);

const originalVercelEnv = process.env.VERCEL;
process.env.VERCEL = "1";
const blockedResponse = {
  statusCode: null,
  body: "",
  writeHead(statusCode) {
    this.statusCode = statusCode;
  },
  end(body) {
    this.body = body;
  }
};
assert.equal(await handleApi({ method: "GET" }, blockedResponse, "/api/events"), true);
assert.equal(blockedResponse.statusCode, 404);
if (originalVercelEnv === undefined) {
  delete process.env.VERCEL;
} else {
  process.env.VERCEL = originalVercelEnv;
}

console.log("smoke ok");
