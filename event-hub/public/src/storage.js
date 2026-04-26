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
  return repository.getSession();
}

export async function signInWithGoogle() {
  const repository = await getRepository();
  return repository.signInWithGoogle();
}

export async function signOutStorage() {
  const repository = await getRepository();
  return repository.signOut();
}

export async function subscribeStorageSession(listener) {
  const repository = await getRepository();
  return repository.subscribeSession(listener);
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
