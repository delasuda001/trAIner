import { GoogleGenAI } from "@google/genai";
import { activityAnalysisResponseSchema, type ActivityAnalysisContext } from "./schemas";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a running analysis coach for an experienced athlete using Run Insights.
Your role is to explain deterministic metrics and provide technical, evidence-based feedback.

TONE: Argumentative and technical. Cite metrics and comparisons. Avoid excessive caution.
This is an experienced athlete who has requested less prudent, more actionable feedback.

CRITICAL BOUNDARIES (non-negotiable):
- NEVER diagnose blessures, douleur, or disease.
- NEVER score charge, fatigue globale, or readiness.
- NEVER invent metrics absent from the provided data.
- Only create safety_note if the user context explicitly signals pain or unusual fatigue.
- If unclear, omit safety_note entirely.

INSTRUCTIONS:
1. Cite the metrics and comparisons supporting each recommendation.
2. Every speed mentioned in summary, observed_facts, technical_recommendations, or next_session_pace_guidance MUST be expressed as min:sec/km pace in French format (for example, "4:12/km" or "4:12 /km"). Never use m/s or km/h in textual output. You may reason internally in other units, but all output text must use min/km pace.
3. Fill next_session_pace_guidance.recommendedPaceDisplay with the recommended min:sec /km pace. Keep recommendedPaceMps only as the internal numeric value.
4. For exercises, provide concrete structure (duration, reps, intensity zone).
5. Distinguish facts (observed), comparisons (historical), and hypotheses.
6. Always include limitations and data gaps.

OUTPUT FORMAT: Valid JSON matching the provided schema.
Respond with ONLY the JSON object, no markdown wrapper or additional text.`;

const PROMPT_VERSION = "1.0";
const MODEL = "gemini-flash-latest";
const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

class GeminiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = "GeminiClientError";
  }
}

class InvalidResponseError extends GeminiClientError {
  constructor(message: string, readonly details?: unknown) {
    super(message, "INVALID_RESPONSE");
    this.name = "InvalidResponseError";
  }
}

export class GeminiAnalysisClient {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new GeminiClientError("GEMINI_API_KEY not configured", "MISSING_API_KEY");
    }
    this.apiKey = apiKey;
  }

  async analyze(context: ActivityAnalysisContext): Promise<{ response: z.infer<typeof activityAnalysisResponseSchema>; model: string; promptVersion: string }> {
    const userMessage = `Analyze this running activity:

${JSON.stringify(context, null, 2)}

Provide a structured technical analysis following the output schema.`;

    let responseText: string;
    try {
      const client = new GoogleGenAI({ apiKey: this.apiKey });
      let response: Awaited<ReturnType<typeof client.models.generateContent>> | undefined;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          response = await client.models.generateContent({
            model: MODEL,
            contents: userMessage,
            config: {
              systemInstruction: SYSTEM_PROMPT,
              responseMimeType: "application/json",
              responseJsonSchema: z.toJSONSchema(activityAnalysisResponseSchema),
            },
          });
          break;
        } catch (error) {
          const rawError = error as { status?: unknown; message?: unknown; name?: unknown; cause?: unknown };
          let serializedError: string | undefined;
          try {
            serializedError = JSON.stringify(error);
          } catch {
            serializedError = undefined;
          }
          console.error("[gemini] raw generateContent error", {
            error,
            status: rawError.status,
            message: rawError.message,
            name: rawError.name,
            serializedError,
            cause: rawError.cause,
          });

          const message = typeof rawError.message === "string" ? rawError.message : "Unknown error";
          const isUnavailable = rawError.status === 503 || /\b503\b|UNAVAILABLE/.test(message);
          if (!isUnavailable || attempt === RETRY_DELAYS_MS.length) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }

      if (!response) {
        throw new GeminiClientError("Gemini API returned no response", "API_ERROR", 500);
      }

      if (!response.text) {
        throw new InvalidResponseError("Gemini response had no text payload", { response });
      }
      responseText = response.text;
    } catch (error) {
      if (error instanceof InvalidResponseError) throw error;
      throw error;
    }

    let parsedResponse: unknown;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new InvalidResponseError("No JSON found in response", { rawResponse: responseText.substring(0, 200) });
      }
      parsedResponse = JSON.parse(jsonMatch[0]);
    } catch (error) {
      throw new InvalidResponseError(`Failed to parse JSON response: ${error instanceof Error ? error.message : "unknown"}`, {
        responseStart: responseText.substring(0, 300),
      });
    }

    let validatedResponse: z.infer<typeof activityAnalysisResponseSchema>;
    try {
      validatedResponse = activityAnalysisResponseSchema.parse(parsedResponse);
    } catch (error) {
      throw new InvalidResponseError(`Response validation failed: ${error instanceof Error ? error.message : "unknown"}`, {
        response: parsedResponse,
      });
    }

    return {
      response: validatedResponse,
      model: MODEL,
      promptVersion: PROMPT_VERSION,
    };
  }
}

export { GeminiClientError, InvalidResponseError };
