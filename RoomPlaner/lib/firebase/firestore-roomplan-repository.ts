import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import type { PlannerProject } from "@/lib/types";
import { getFirebaseDb } from "@/lib/firebase/client";

const ROOMPLAN_COLLECTION = "roomPlans";

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
    return (data.project ?? null) as PlannerProject | null;
  }

  async save(user: Pick<User, "uid" | "displayName" | "email">, project: PlannerProject) {
    const db = getFirebaseDb();
    if (!db) {
      throw new Error("Firebase is not configured.");
    }

    await setDoc(
      doc(db, ROOMPLAN_COLLECTION, user.uid),
      {
        project,
        updatedAt: serverTimestamp(),
        owner: {
          displayName: user.displayName ?? null,
          email: user.email ?? null
        }
      },
      { merge: true }
    );
  }
}
