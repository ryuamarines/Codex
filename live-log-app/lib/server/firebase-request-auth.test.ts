import { describe, expect, it } from "vitest";
import { validateFirebaseTokenClaims } from "@/lib/server/firebase-request-auth";

const PROJECT_ID = "live-log-test";
const NOW = 2_000_000_000;

function createClaims() {
  return {
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    sub: "user-123",
    user_id: "user-123",
    exp: NOW + 3600,
    iat: NOW - 30,
    auth_time: NOW - 60
  };
}

describe("validateFirebaseTokenClaims", () => {
  it("accepts a current token for the configured project", () => {
    expect(validateFirebaseTokenClaims(createClaims(), PROJECT_ID, NOW)).toBe("user-123");
  });

  it("rejects expired tokens", () => {
    expect(
      validateFirebaseTokenClaims({ ...createClaims(), exp: NOW - 301 }, PROJECT_ID, NOW)
    ).toBeNull();
  });

  it("rejects tokens issued for another Firebase project", () => {
    expect(validateFirebaseTokenClaims(createClaims(), "other-project", NOW)).toBeNull();
  });

  it("rejects inconsistent user identifiers", () => {
    expect(
      validateFirebaseTokenClaims({ ...createClaims(), user_id: "another-user" }, PROJECT_ID, NOW)
    ).toBeNull();
  });
});
