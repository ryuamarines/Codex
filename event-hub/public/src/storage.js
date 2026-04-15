import { createEventRepository } from "./event-repository.js";

let repositoryPromise = null;

function getRepository() {
  if (!repositoryPromise) {
    repositoryPromise = createEventRepository();
  }

  return repositoryPromise;
}

export async function initializeStorage() {
  const repository = await getRepository();

  if (repository.getSession) {
    return repository.getSession();
  }

  return {
    authRequired: false,
    backendLabel: "Local API / JSON",
    user: null,
    isAllowed: true
  };
}

export async function signInWithGoogle() {
  const repository = await getRepository();
  if (!repository.signInWithGoogle) {
    throw new Error("この保存方式では Google ログインを使いません。");
  }
  return repository.signInWithGoogle();
}

export async function signInWithEmailPassword(email, password) {
  const repository = await getRepository();
  if (!repository.signInWithEmailPassword) {
    throw new Error("この保存方式ではメールログインを使いません。");
  }
  return repository.signInWithEmailPassword(email, password);
}

export async function signOutStorageUser() {
  const repository = await getRepository();
  if (repository.signOut) {
    await repository.signOut();
  }
}

export async function refreshStorageSession() {
  const repository = await getRepository();

  if (repository.getSession) {
    return repository.getSession();
  }

  return {
    authRequired: false,
    backendLabel: "Local API / JSON",
    user: null,
    isAllowed: true
  };
}

export async function loadEvents() {
  const repository = await getRepository();
  return repository.load();
}

export async function saveEvents(events) {
  const repository = await getRepository();
  return repository.save(events);
}

export async function resetEvents() {
  const repository = await getRepository();
  return repository.reset();
}

export async function importEventsCsv(csvText) {
  const repository = await getRepository();
  return repository.importCsv(csvText);
}

export async function exportEventsCsv() {
  const repository = await getRepository();
  return repository.exportCsv();
}
