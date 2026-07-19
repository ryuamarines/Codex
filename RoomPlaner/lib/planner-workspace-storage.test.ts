import { describe, expect, it } from "vitest";
import { sampleProject } from "@/data/sample-project";
import {
  createEmptyPlannerProject,
  importGuestWorkspace,
  inspectGuestWorkspace,
  loadPlannerWorkspace,
  persistPlannerProject,
  readPlannerProject,
  readPlannerWorkspaceSnapshot,
  removePlannerProject,
  replacePlannerWorkspace,
  setActivePlannerProject
} from "@/lib/planner-workspace-storage";
import { clonePlannerProject, parsePlannerProject, parsePlannerProjectJson } from "@/lib/project-schema";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

class FailingStorage extends MemoryStorage {
  private failingKey: string | null = null;

  failOnceOn(key: string) {
    this.failingKey = key;
  }

  override setItem(key: string, value: string) {
    if (key === this.failingKey) {
      this.failingKey = null;
      throw new Error("quota exceeded");
    }
    super.setItem(key, value);
  }
}

describe("project schema", () => {
  it("rejects malformed or unrelated JSON without guessing a project", () => {
    expect(() => parsePlannerProjectJson("{"))
      .toThrow("元データは削除せず保持しています");
    expect(() => parsePlannerProject({ hello: "world" }))
      .toThrow("RoomPlanerのプロジェクト形式ではありません");
  });

  it("normalizes unsafe values and duplicate object IDs", () => {
    const input = clonePlannerProject(sampleProject);
    input.floorOpacity = 9;
    input.room!.id = "same-id";
    input.windows[0].id = "same-id";
    input.doors[0].id = "same-id";
    input.furniture[0].id = "same-id";

    const parsed = parsePlannerProject(input);
    const objectIds = [
      parsed.room!.id,
      parsed.windows[0].id,
      parsed.doors[0].id,
      parsed.furniture[0].id
    ];

    expect(parsed.floorOpacity).toBe(1);
    expect(new Set(objectIds).size).toBe(objectIds.length);
  });

  it("keeps raster backgrounds and rejects executable image formats", () => {
    const safe = parsePlannerProject({
      ...sampleProject,
      background: {
        dataUrl: "data:image/png;base64,b2s=",
        visible: true,
        opacity: 0.5,
        locked: true,
        width: 10,
        height: 10
      }
    });
    const unsafe = parsePlannerProject({
      ...sampleProject,
      background: {
        ...safe.background,
        dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="
      }
    });

    expect(safe.background?.dataUrl).toContain("image/png");
    expect(unsafe.background).toBeNull();
  });
});

describe("planner workspace storage", () => {
  it("migrates the legacy guest key while retaining the original JSON", () => {
    const storage = new MemoryStorage();
    const legacyRaw = JSON.stringify({ ...sampleProject, name: "旧保存" });
    storage.setItem("roomplaner.mpp.v1.guest", legacyRaw);

    const loaded = loadPlannerWorkspace(storage, "guest");

    expect(loaded.migratedLegacy).toBe(true);
    expect(loaded.persisted).toBe(true);
    expect(loaded.activeProject.name).toBe("旧保存");
    expect(storage.getItem("roomplaner.mpp.v1.guest")).toBe(legacyRaw);
    expect(storage.getItem("roomplaner.workspace.v2.guest")).not.toBeNull();
  });

  it("keeps a recovery copy of corrupt v2 data after fallback edits", () => {
    const storage = new MemoryStorage();
    storage.setItem("roomplaner.workspace.v2.guest", "{broken");

    const loaded = loadPlannerWorkspace(storage, "guest");
    persistPlannerProject(storage, "guest", loaded.index, loaded.activeProject);

    expect(loaded.persisted).toBe(true);
    expect(loaded.errors).toHaveLength(1);
    expect(storage.getItem("roomplaner.workspace.v2.guest")).not.toBe("{broken");
    expect(storage.getItem("roomplaner.workspace.v2.guest.recovery")).toBe("{broken");
  });

  it("persists, switches, and removes multiple projects independently", () => {
    const storage = new MemoryStorage();
    let index = loadPlannerWorkspace(storage, "guest").index;
    index = persistPlannerProject(storage, "guest", index, sampleProject, { updatedAtMs: 10 });

    const first = createEmptyPlannerProject("案件A");
    const second = createEmptyPlannerProject("案件B");
    index = persistPlannerProject(storage, "guest", index, first, { updatedAtMs: 20 });
    index = persistPlannerProject(storage, "guest", index, second, { updatedAtMs: 30 });

    const contentRevision = index.contentRevision;
    index = setActivePlannerProject(storage, "guest", index, first.id);
    expect(readPlannerProject(storage, "guest", index.activeProjectId).name).toBe("案件A");
    expect(index.contentRevision).toBe(contentRevision);

    index = removePlannerProject(storage, "guest", index, first.id);
    expect(index.projects.map((project) => project.name)).toEqual(["サンプルルーム", "案件B"]);
    expect(() => readPlannerProject(storage, "guest", first.id)).toThrow("見つかりません");
  });

  it("isolates projects with the same ID between user accounts", () => {
    const storage = new MemoryStorage();
    const accountA = loadPlannerWorkspace(storage, "user.account-a").index;
    const accountB = loadPlannerWorkspace(storage, "user.account-b").index;

    persistPlannerProject(storage, "user.account-a", accountA, { ...sampleProject, name: "アカウントA" });
    persistPlannerProject(storage, "user.account-b", accountB, { ...sampleProject, name: "アカウントB" });

    expect(readPlannerProject(storage, "user.account-a", sampleProject.id).name).toBe("アカウントA");
    expect(readPlannerProject(storage, "user.account-b", sampleProject.id).name).toBe("アカウントB");
  });

  it("copies guest projects into a user scope once and keeps guest originals", () => {
    const storage = new MemoryStorage();
    let guestIndex = loadPlannerWorkspace(storage, "guest").index;
    guestIndex = persistPlannerProject(storage, "guest", guestIndex, sampleProject, { updatedAtMs: 10 });
    const guestProject = createEmptyPlannerProject("ゲスト案件");
    guestIndex = persistPlannerProject(storage, "guest", guestIndex, guestProject, { updatedAtMs: 20 });

    let userIndex = loadPlannerWorkspace(storage, "user.test-user").index;
    userIndex = persistPlannerProject(storage, "user.test-user", userIndex, sampleProject, { updatedAtMs: 30 });

    expect(inspectGuestWorkspace(storage, 0)).toMatchObject({ available: true, count: 1 });
    const imported = importGuestWorkspace(storage, "user.test-user", userIndex);

    expect(imported.importedProjects).toHaveLength(1);
    expect(imported.importedProjects[0].name).toBe("ゲスト案件（ゲストから）");
    expect(readPlannerProject(storage, "guest", guestProject.id).name).toBe("ゲスト案件");
    expect(inspectGuestWorkspace(storage, imported.index.importedGuestRevision).available).toBe(false);
  });

  it("replaces a full workspace atomically while retaining local-only backgrounds", () => {
    const storage = new MemoryStorage();
    let index = loadPlannerWorkspace(storage, "user.cloud-user").index;
    const local = {
      ...clonePlannerProject(sampleProject),
      background: {
        dataUrl: "data:image/png;base64,bG9jYWw=",
        visible: true,
        opacity: 0.5,
        locked: true,
        width: 800,
        height: 600
      }
    };
    index = persistPlannerProject(storage, "user.cloud-user", index, local, { updatedAtMs: 10 });
    const second = createEmptyPlannerProject("クラウド案B");

    const replaced = replacePlannerWorkspace(
      storage,
      "user.cloud-user",
      {
        activeProjectId: second.id,
        projects: [{ ...local, background: null, name: "クラウド案A" }, second]
      },
      { importedGuestRevision: 7, updatedAtMs: 20 }
    );

    expect(replaced.activeProject.name).toBe("クラウド案B");
    expect(replaced.index.importedGuestRevision).toBe(7);
    expect(readPlannerProject(storage, "user.cloud-user", local.id).background?.dataUrl).toContain("bG9jYWw");
    expect(readPlannerWorkspaceSnapshot(storage, "user.cloud-user", replaced.index).projects).toHaveLength(2);
    expect(storage.getItem("roomplaner.workspace.v2.user.cloud-user.before-cloud")).not.toBeNull();
  });

  it("rolls back project bodies when the cloud workspace index cannot be committed", () => {
    const storage = new FailingStorage();
    let index = loadPlannerWorkspace(storage, "user.rollback-user").index;
    const local = { ...clonePlannerProject(sampleProject), name: "端末の原本" };
    index = persistPlannerProject(storage, "user.rollback-user", index, local, { updatedAtMs: 10 });
    const cloudOnly = createEmptyPlannerProject("クラウドだけの案");
    storage.failOnceOn("roomplaner.workspace.v2.user.rollback-user");

    expect(() => replacePlannerWorkspace(
      storage,
      "user.rollback-user",
      {
        activeProjectId: cloudOnly.id,
        projects: [{ ...local, name: "クラウドの上書き" }, cloudOnly]
      },
      { updatedAtMs: 20 }
    )).toThrow("quota exceeded");

    expect(readPlannerProject(storage, "user.rollback-user", local.id).name).toBe("端末の原本");
    expect(() => readPlannerProject(storage, "user.rollback-user", cloudOnly.id)).toThrow("見つかりません");
    expect(loadPlannerWorkspace(storage, "user.rollback-user").index.activeProjectId).toBe(local.id);
  });

  it("removes orphaned project bodies after a successful cloud replacement", () => {
    const storage = new MemoryStorage();
    let index = loadPlannerWorkspace(storage, "user.cleanup-user").index;
    const retained = { ...clonePlannerProject(sampleProject), name: "残す案" };
    const stale = createEmptyPlannerProject("削除済み案");
    index = persistPlannerProject(storage, "user.cleanup-user", index, retained, { updatedAtMs: 10 });
    persistPlannerProject(storage, "user.cleanup-user", index, stale, { updatedAtMs: 11 });

    replacePlannerWorkspace(
      storage,
      "user.cleanup-user",
      { activeProjectId: retained.id, projects: [retained] },
      { updatedAtMs: 20 }
    );

    expect(readPlannerProject(storage, "user.cleanup-user", retained.id).name).toBe("残す案");
    expect(() => readPlannerProject(storage, "user.cleanup-user", stale.id)).toThrow("見つかりません");
  });
});
