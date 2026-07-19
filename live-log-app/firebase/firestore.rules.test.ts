import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "demo-livelog";
const OWNER_ID = "owner-user";
const OTHER_USER_ID = "other-user";

let testEnvironment: RulesTestEnvironment;

function readEmulatorAddress() {
  const value = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  const separatorIndex = value.lastIndexOf(":");
  return {
    host: value.slice(0, separatorIndex),
    port: Number(value.slice(separatorIndex + 1))
  };
}

function createArchiveData() {
  return {
    settings: { driveFolderId: "" },
    revision: 1,
    entryIds: ["entry-1"],
    updatedAt: Timestamp.now(),
    owner: {
      displayName: "Owner",
      email: "owner@example.com"
    }
  };
}

function createEntryData() {
  return {
    id: "entry-1",
    title: "Test Live",
    date: "2026-07-19",
    place: "Tokyo",
    venue: "Test Hall",
    artists: ["Test Artist"],
    genre: "",
    memo: "",
    images: [],
    updatedAt: Timestamp.now()
  };
}

beforeAll(async () => {
  const { host, port } = readEmulatorAddress();
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: readFileSync(new URL("./firestore.rules", import.meta.url), "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("Firestore owner isolation", () => {
  it("allows an owner to create and read their archive and entry", async () => {
    const db = testEnvironment.authenticatedContext(OWNER_ID).firestore();
    const archiveRef = doc(db, "liveLogArchives", OWNER_ID);
    const entryRef = doc(db, "liveLogArchives", OWNER_ID, "entries", "entry-1");

    await assertSucceeds(setDoc(archiveRef, createArchiveData()));
    await assertSucceeds(setDoc(entryRef, createEntryData()));
    await assertSucceeds(getDoc(archiveRef));
    await assertSucceeds(getDoc(entryRef));
  });

  it("rejects reads and writes from another user", async () => {
    const ownerDb = testEnvironment.authenticatedContext(OWNER_ID).firestore();
    const otherDb = testEnvironment.authenticatedContext(OTHER_USER_ID).firestore();

    await assertSucceeds(
      setDoc(doc(ownerDb, "liveLogArchives", OWNER_ID), createArchiveData())
    );
    await assertFails(getDoc(doc(otherDb, "liveLogArchives", OWNER_ID)));
    await assertFails(
      setDoc(doc(otherDb, "liveLogArchives", OWNER_ID), createArchiveData())
    );
  });

  it("rejects unauthenticated reads", async () => {
    const db = testEnvironment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "liveLogArchives", OWNER_ID)));
  });
});

describe("Firestore schema validation", () => {
  it("rejects unknown archive fields", async () => {
    const db = testEnvironment.authenticatedContext(OWNER_ID).firestore();
    await assertFails(
      setDoc(doc(db, "liveLogArchives", OWNER_ID), {
        ...createArchiveData(),
        unexpected: "blocked"
      })
    );
  });

  it("rejects entries with too many images", async () => {
    const db = testEnvironment.authenticatedContext(OWNER_ID).firestore();
    await assertFails(
      setDoc(doc(db, "liveLogArchives", OWNER_ID, "entries", "entry-1"), {
        ...createEntryData(),
        images: Array.from({ length: 31 }, () => ({}))
      })
    );
  });

  it("keeps the legacy entries array writable during migration", async () => {
    const db = testEnvironment.authenticatedContext(OWNER_ID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "liveLogArchives", OWNER_ID), {
        ...createArchiveData(),
        entries: [createEntryData()]
      })
    );
  });
});
