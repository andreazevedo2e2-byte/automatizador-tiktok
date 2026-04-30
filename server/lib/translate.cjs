async function translateTexts({ texts, from = "en", to = "pt" }) {
  const normalized = Array.isArray(texts) ? texts : [texts];
  const translated = [];

  for (const text of normalized) {
    if (!String(text || "").trim()) {
      translated.push("");
      continue;
    }

    const params = new URLSearchParams({
      client: "gtx",
      sl: from,
      tl: to,
      dt: "t",
      q: String(text),
    });

    const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Translation request failed with ${response.status}.`);
    }

    const payload = await response.json();
    const translatedText = Array.isArray(payload?.[0]) ? payload[0].map((entry) => entry?.[0] || "").join("") : "";
    translated.push(translatedText.trim());
  }

  return translated;
}

module.exports = { translateTexts };
