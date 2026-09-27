function cleanList(value, limit = 6) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return items
    .map((item) => typeof item === "string" ? item : item?.text || item?.description || "")
    .map((item) => String(item || "").replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function parseLabeledAnalysis(text) {
  const sections = { summary: [], spaces: [], layoutObservations: [], recommendations: [] };
  let currentSection = "summary";
  const headingMap = new Map([
    ["summary", "summary"],
    ["overview", "summary"],
    ["visible spaces", "spaces"],
    ["spaces", "spaces"],
    ["rooms", "spaces"],
    ["layout observations", "layoutObservations"],
    ["observations", "layoutObservations"],
    ["recommendations", "recommendations"],
    ["suggestions", "recommendations"],
  ]);

  for (const sourceLine of text.replace(/```(?:\w+)?/gi, "").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line) continue;
    const heading = line.replace(/^#{1,6}\s*/, "").replace(/:$/, "").toLowerCase();
    if (headingMap.has(heading)) {
      currentSection = headingMap.get(heading);
      continue;
    }
    sections[currentSection].push(line.replace(/^\s*[-*]\s*/, ""));
  }

  const spaces = sections.spaces.slice(0, 6).map((entry) => ({
    name: entry.slice(0, 80),
    location: "Not specified",
    evidence: "Gemini identified this from the visible plan; verify against the original drawing.",
  }));

  return {
    summary: sections.summary.join(" ").trim(),
    spaces,
    layoutObservations: cleanList(sections.layoutObservations),
    recommendations: cleanList(sections.recommendations),
  };
}

function parseAnalysisText(responseText) {
  const cleanedText = responseText
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  for (const candidate of [cleanedText, extractJsonObject(cleanedText)].filter(Boolean)) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next representation, then fall back to readable text.
    }
  }

  const labeled = parseLabeledAnalysis(cleanedText);
  if (labeled.summary || labeled.spaces.length || labeled.layoutObservations.length || labeled.recommendations.length) {
    return labeled;
  }

  return { summary: cleanedText, spaces: [], layoutObservations: [], recommendations: [] };
}

export async function analyzeFloorPlanWithGemini(imageBuffer, mimeType, {
  apiKey,
  model = "gemini-3.8-flash",
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error("Gemini floor-plan analysis is not configured. Add GEMINI_API_KEY to Backend/.env.");
  if (!imageBuffer?.length) throw new Error("Choose a floor-plan image before running Gemini analysis.");
  if (!["image/jpeg", "image/png"].includes(mimeType)) {
    throw new Error("Gemini floor-plan analysis supports JPG and PNG images.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          {
            text: "Analyze this architectural floor plan visually. Return only JSON with keys: summary (string), spaces (array of objects with name, location, evidence), layoutObservations (array of strings), recommendations (array of strings). Identify only spaces and features actually visible; mark uncertain interpretations as uncertain. Do not claim measured dimensions, code compliance, structural safety, or exact room counts when the drawing does not establish them. Keep each list to at most 6 useful items.",
          },
          { inlineData: { mimeType, data: imageBuffer.toString("base64") } },
        ],
      }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        maxOutputTokens: 900,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = payload?.error?.message || `Gemini analysis failed with status ${response.status}.`;
    const isTemporary = response.status === 429 || response.status >= 500 || /high demand|overload|temporarily unavailable/i.test(providerMessage);
    const error = new Error(isTemporary
      ? "Gemini is temporarily busy. Wait a moment and retry the analysis."
      : providerMessage);
    error.status = isTemporary ? 503 : response.status;
    throw error;
  }

  const responseText = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!responseText) throw new Error("Gemini did not return a floor-plan analysis.");

  const analysis = parseAnalysisText(responseText);

  const spaces = Array.isArray(analysis.spaces)
    ? analysis.spaces.slice(0, 6).map((space) => ({
        name: String(typeof space === "string" ? space : space?.name || "Unidentified space").trim().slice(0, 80),
        location: String(space?.location || "Not specified").trim().slice(0, 120),
        evidence: String(typeof space === "string" ? "" : space?.evidence || "").trim().slice(0, 180),
      }))
    : [];

  return {
    summary: String(analysis.summary || responseText).trim().slice(0, 900),
    spaces,
    layoutObservations: cleanList(analysis.layoutObservations),
    recommendations: cleanList(analysis.recommendations),
  };
}