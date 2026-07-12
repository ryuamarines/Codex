import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import type { PlannerProject } from "@/lib/types";
import { getFirebaseDb } from "@/lib/firebase/client";

const ROOMPLAN_COLLECTION = "roomPlans";
const FIRESTORE_DOC_SOFT_LIMIT_BYTES = 900_000;
const ROOMPLAN_SCHEMA_VERSION = 1;

function buildCloudProject(project: PlannerProject) {
  return {
    ...project,
    background: project.background ? null : project.background
  } satisfies PlannerProject;
}

function estimateJsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export class FirestoreRoomPlanRepository {
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

    return (data.project ?? null) as PlannerProject | null;
  }

  async save(user: Pick<User, "uid" | "displayName" | "email">, project: PlannerProject) {
    const db = getFirebaseDb();
    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    const cloudProject = buildCloudProject(project);
    const payload = {
      project: cloudProject,
      owner: {
        uid: user.uid,
        displayName: user.displayName ?? null,
        email: user.email ?? null
      }
    };

    if (estimateJsonBytes(payload) > FIRESTORE_DOC_SOFT_LIMIT_BYTES) {
      throw new Error("プロジェクトが大きすぎて保存できません。背景画像を外してもサイズが大きいため、家具や画像を整理してから再保存してください。");
    }

    await setDoc(
      doc(db, ROOMPLAN_COLLECTION, user.uid),
      {
        schemaVersion: ROOMPLAN_SCHEMA_VERSION,
        project: cloudProject,
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
        owner: {
          uid: user.uid,
          displayName: user.displayName ?? null,
          email: user.email ?? null
        }
      },
      { merge: true }
    );

    return {
      backgroundOmitted: project.background !== null
    };
  }
}
