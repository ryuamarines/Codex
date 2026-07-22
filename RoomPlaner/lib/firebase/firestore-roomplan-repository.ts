import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import type { PlannerProject } from "@/lib/types";
import {
  buildCloudWorkspace,
  CLOUD_WORKSPACE_SCHEMA_VERSION,
  parseCloudWorkspaceRecord
} from "@/lib/cloud-workspace";
import type { PlannerWorkspaceSnapshot } from "@/lib/planner-workspace-storage";
import { getFirebaseDb } from "@/lib/firebase/client";

const ROOMPLAN_COLLECTION = "roomPlans";
const FIRESTORE_DOC_SOFT_LIMIT_BYTES = 900_000;

function estimateJsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export class FirestoreRoomPlanRepository {
  static readonly schemaVersion = CLOUD_WORKSPACE_SCHEMA_VERSION;

  async load(user: Pick<User, "uid">) {
    const db = getFirebaseDb();
    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const snapshot = await getDoc(doc(db, ROOMPLAN_COLLECTION, user.uid));
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    if (!data || typeof data !== "object") {
      return null;
    }

    const ownerUid = "owner" in data && data.owner && typeof data.owner === "object" ? (data.owner as { uid?: unknown }).uid : null;
    if (ownerUid && ownerUid !== user.uid) {
      throw new Error("Firestore の保存データ所有者が現在のユーザーと一致しません。");
    }

    return parseCloudWorkspaceRecord(data);
  }

  async saveWorkspace(
    user: Pick<User, "uid" | "displayName" | "email">,
    snapshot: PlannerWorkspaceSnapshot
  ) {
    const db = getFirebaseDb();
    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const cloud = buildCloudWorkspace(snapshot);
    const updatedAtMs = Date.now();
    const payload = {
      workspace: cloud.workspace,
      project: cloud.legacyProject,
      owner: {
        uid: user.uid,
        displayName: user.displayName ?? null,
        email: user.email ?? null
      }
    };

    if (estimateJsonBytes(payload) > FIRESTORE_DOC_SOFT_LIMIT_BYTES) {
      throw new Error("プロジェクト一覧が大きすぎてクラウド保存できません。不要な案や家具を整理してから再保存してください。");
    }

    await setDoc(
      doc(db, ROOMPLAN_COLLECTION, user.uid),
      {
        schemaVersion: CLOUD_WORKSPACE_SCHEMA_VERSION,
        workspace: cloud.workspace,
        project: cloud.legacyProject,
        updatedAt: serverTimestamp(),
        updatedAtMs,
        owner: {
          uid: user.uid,
          displayName: user.displayName ?? null,
          email: user.email ?? null
        }
      },
      { merge: true }
    );

    return {
      backgroundsOmitted: cloud.backgroundsOmitted,
      updatedAtMs
    };
  }

  async save(user: Pick<User, "uid" | "displayName" | "email">, project: PlannerProject) {
    return this.saveWorkspace(user, { activeProjectId: project.id, projects: [project] });
  }
}
