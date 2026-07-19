import { describe, expect, it } from "vitest";
import { applyOcrCandidatesToManualForm } from "@/lib/live-add-flow";

describe("applyOcrCandidatesToManualForm", () => {
  it("fills empty review fields and preserves existing user edits", () => {
    const result = applyOcrCandidatesToManualForm(
      {
        title: "手入力した公演名",
        date: "",
        place: "東京",
        venue: "",
        artistsText: "",
        genre: "",
        memo: ""
      },
      {
        dateCandidate: "2026-07-18",
        venueCandidate: "Zepp Shinjuku",
        artistCandidates: ["NEW BAND", "GUEST ACT"],
        titleFragment: "OCRの公演名",
        openTimeCandidate: "17:00",
        startTimeCandidate: "18:00",
        confidence: 0.8
      }
    );

    expect(result).toMatchObject({
      title: "手入力した公演名",
      date: "2026-07-18",
      place: "東京",
      venue: "Zepp Shinjuku",
      artistsText: "NEW BAND / GUEST ACT",
      memo: "OPEN 17:00 / START 18:00"
    });
  });
});
