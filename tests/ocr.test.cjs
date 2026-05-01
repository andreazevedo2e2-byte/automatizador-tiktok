const { cleanOcrText, restoreGluedEnglish, scoreOcrCandidate } = require("../server/lib/ocr.cjs");

describe("ocr cleanup", () => {
  it("repairs glued English from slideshow OCR", () => {
    expect(cleanOcrText("A\n10thingsIwishIknew\nasabeginner")).toBe("10 things I wish I knew\nas a beginner");
    expect(cleanOcrText("3.Yourmacrosrsoooo\nimportant\nfindoutyourdailyprotein,\ncaloriesgoal")).toContain(
      "find out your daily protein"
    );
  });

  it("prefers readable OCR candidates over noisy text", () => {
    const clean = scoreOcrCandidate({
      text: restoreGluedEnglish("doeverysetaimingRIR2-1 andlastonetill.failure"),
      confidence: 70,
    });
    const noisy = scoreOcrCandidate({
      text: "SNE ) i} Ln . Cre J > Ar mT Fo Sf 4 ht",
      confidence: 40,
    });

    expect(clean).toBeGreaterThan(noisy);
  });
});
