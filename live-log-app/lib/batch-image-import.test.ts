import { describe, expect, it } from "vitest";
import {
  extractCandidatesFromText,
  inferBatchImageTypeFromText
} from "@/lib/batch-image-import";

describe("extractCandidatesFromText", () => {
  it("extracts review fields from an electronic ticket without prior archive names", () => {
    const result = extractCandidatesFromText(
      [
        "LIVE TOUR 2026 FINAL",
        "2026年7月18日",
        "会場: Zepp Shinjuku",
        "出演: NEW BAND / GUEST ACT",
        "OPEN 17:00 START 18:00",
        "電子チケット QR CODE"
      ].join("\n"),
      "ticket",
      []
    );

    expect(result.dateCandidate).toBe("2026-07-18");
    expect(result.venueCandidate).toBe("Zepp Shinjuku");
    expect(result.artistCandidates).toEqual(["NEW BAND", "GUEST ACT"]);
    expect(result.openTimeCandidate).toBe("17:00");
    expect(result.startTimeCandidate).toBe("18:00");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("rejects impossible OCR dates", () => {
    const result = extractCandidatesFromText(
      "LIVE TOUR\n2026/19/48\nOPEN 99:99",
      "ticket",
      []
    );

    expect(result.dateCandidate).toBeUndefined();
    expect(result.openTimeCandidate).toBeUndefined();
  });

  it("extracts unlabeled artists from real OCR output and tolerates a distorted START label", () => {
    const result = extractCandidatesFromText(
      [
        "UNISON SQUARE GARDEN",
        "ASIAN KUNG-FU GENERATION",
        "2026年7月19日(日)",
        "会場: Zepp Shinjuku",
        "OPEN 17:00",
        "SITART 18:00",
        "電子チケット",
        "LIVELOG OCR TEST"
      ].join("\n"),
      "ticket",
      []
    );

    expect(result.dateCandidate).toBe("2026-07-19");
    expect(result.venueCandidate).toBe("Zepp Shinjuku");
    expect(result.artistCandidates).toEqual([
      "UNISON SQUARE GARDEN",
      "ASIAN KUNG-FU GENERATION"
    ]);
    expect(result.openTimeCandidate).toBe("17:00");
    expect(result.startTimeCandidate).toBe("18:00");
    expect(result.titleFragment).toBe("LIVELOG OCR TEST");
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});

describe("inferBatchImageTypeFromText", () => {
  it("classifies generic smartphone filenames after OCR text is available", () => {
    expect(inferBatchImageTypeFromText("電子チケット\n整理番号 A-100", "other")).toBe("ticket");
    expect(inferBatchImageTypeFromText("本日の公演\nOPEN 18:00", "other")).toBe("signboard");
  });
});
