import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFloorPlanWithGemini } from "../src/geminiFloorPlan.js";

function mockedGeminiResponse(text) {
  return async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("sends the floor plan to Gemini and returns structured analysis", async () => {
  let requestUrl = "";
  let requestBody;
  const result = await analyzeFloorPlanWithGemini(Buffer.from("floor plan image"), "image/png", {
    apiKey: "test-key",
    fetchImpl: async (url, init) => {
      requestUrl = url;
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                summary: "A compact plan with a central hall.",
                spaces: [{ name: "Bedroom", location: "North side", evidence: "Bed symbol visible." }],
                layoutObservations: ["The hall connects the rooms."],
                recommendations: ["Check daylight access."],
              }),
            }],
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  assert.match(requestUrl, /gemini-3\.8-flash:generateContent/);
  assert.match(requestUrl, /key=test-key/);
  assert.equal(requestBody.contents[0].parts[1].inlineData.mimeType, "image/png");
  assert.equal(requestBody.contents[0].parts[1].inlineData.data, Buffer.from("floor plan image").toString("base64"));
  assert.equal(result.spaces[0].name, "Bedroom");
  assert.equal(result.layoutObservations[0], "The hall connects the rooms.");
});

test("parses JSON wrapped in a Markdown code fence", async () => {
  const result = await analyzeFloorPlanWithGemini(Buffer.from("image"), "image/jpeg", {
    apiKey: "test-key",
    fetchImpl: mockedGeminiResponse(`Here is the plan analysis:\n\n\`\`\`json\n{"summary":"A compact plan.","spaces":["Kitchen"],"layoutObservations":["Hall links rooms."],"recommendations":["Check daylight."]}\n\`\`\``),
  });

  assert.equal(result.summary, "A compact plan.");
  assert.equal(result.spaces[0].name, "Kitchen");
  assert.equal(result.layoutObservations[0], "Hall links rooms.");
});

test("extracts a JSON object surrounded by explanatory text", async () => {
  const result = await analyzeFloorPlanWithGemini(Buffer.from("image"), "image/png", {
    apiKey: "test-key",
    fetchImpl: mockedGeminiResponse('Analysis follows: {"summary":"A plan with distinct room blocks.","spaces":[],"layoutObservations":["Central circulation."],"recommendations":[]} End.'),
  });

  assert.equal(result.summary, "A plan with distinct room blocks.");
  assert.equal(result.layoutObservations[0], "Central circulation.");
});

test("turns labeled Markdown analysis into displayable sections", async () => {
  const result = await analyzeFloorPlanWithGemini(Buffer.from("image"), "image/png", {
    apiKey: "test-key",
    fetchImpl: mockedGeminiResponse([
      "Summary:",
      "A rectangular plan with rooms arranged around a central passage.",
      "Visible spaces:",
      "- Bedroom on the north side",
      "- Kitchen near the east entrance",
      "Layout observations:",
      "- The passage connects the major rooms.",
      "Recommendations:",
      "- Verify window locations against the source drawing.",
    ].join("\n")),
  });

  assert.match(result.summary, /rectangular plan/);
  assert.equal(result.spaces.length, 2);
  assert.equal(result.spaces[0].name, "Bedroom on the north side");
  assert.equal(result.layoutObservations[0], "The passage connects the major rooms.");
  assert.equal(result.recommendations[0], "Verify window locations against the source drawing.");
});

test("returns a retryable message when Gemini is temporarily overloaded", async () => {
  await assert.rejects(
    analyzeFloorPlanWithGemini(Buffer.from("image"), "image/png", {
      apiKey: "test-key",
      fetchImpl: async () => new Response(JSON.stringify({
        error: { message: "This model is currently experiencing high demand. Please try again later." },
      }), { status: 503, headers: { "Content-Type": "application/json" } }),
    }),
    (error) => error.status === 503 && /temporarily busy/.test(error.message)
  );
});

test("requires a Gemini key for floor-plan analysis", async () => {
  await assert.rejects(
    analyzeFloorPlanWithGemini(Buffer.from("image"), "image/png"),
    /GEMINI_API_KEY/
  );
});