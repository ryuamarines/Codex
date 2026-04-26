export const APP_TITLE = "Event Hub";

export const APP_RUNTIME = {
  dataBackend: "auto"
};

export function resolveDataBackend() {
  if (APP_RUNTIME.dataBackend !== "auto") {
    return APP_RUNTIME.dataBackend;
  }

  if (typeof window === "undefined") {
    return "api";
  }

  const { hostname } = window.location;

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "api";
  }

  return "firestore";
}
