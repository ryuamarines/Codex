import { describe, expect, it } from "vitest";
import { calculateOcrScale, scoreOcrResult } from "@/lib/image-ocr-service";

describe("calculateOcrScale", () => {
  it("downscales large smartphone photos before OCR", () => {
    expect(calculateOcrScale(4032, 3024, "ticket")).toBeLessThan(1);
    expect(Math.round(4032 * calculateOcrScale(4032, 3024, "ticket"))).toBe(2600);
  });

  it("caps small-image upscaling", () => {
    expect(calculateOcrScale(600, 400, "ticket")).toBe(2.4);
    expect(calculateOcrScale(600, 400, "signboard")).toBe(1.8);
  });
});

describe("scoreOcrResult", () => {
  it("keeps English event labels intact while correcting ambiguous date digits", () => {
    const eventScore = scoreOcrResult(
      {
        text: "2026/07/19 OPEN 17:00 START 18:00 LIVE at Zepp Shinjuku",
        confidence: 0.55
      },
      "ticket"
    );
    const neutralScore = scoreOcrResult(
      {
        text: "2026/07/19 note 17:00 detail 18:00 place Zepp Shinjuku",
        confidence: 0.55
      },
      "ticket"
    );

    expect(eventScore).toBeGreaterThan(neutralScore + 0.1);
  });
});
