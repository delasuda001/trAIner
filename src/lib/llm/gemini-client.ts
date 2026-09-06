import { GoogleGenAI } from "@google/genai";
import { activityAnalysisResponseSchema, conversationResponseSchema, type ActivityAnalysisContext } from "./schemas";
import type { ConversationContext } from "./conversation-context";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a running analysis coach for an experienced athlete using Run Insights.
Your role is to explain deterministic metrics and provide technical, evidence-based feedback.

TONE: Argumentative and technical. Cite metrics and comparisons. Avoid excessive caution.
This is an experienced athlete who has requested less prudent, more actionable feedback.

CRITICAL BOUNDARIES (non-negotiable):
- NEVER diagnose injury, pain, disease, or medical condition.
- NEVER score global fatigue, load, or readiness.
- NEVER invent metrics absent from the provided data.
- Only create safety_note if the user context explicitly signals pain or unusual fatigue.
- If unclear, omit safety_note entirely.
- NEVER mention internal variable names or technical field names such as validPointCount, thresholdEstimate, percentOfThreshold, or any other private implementation names in the final text. Rewrite them in plain language instead.

INSTRUCTIONS:
1. Write 3 short key takeaways at the top, in simple language, without jargon.
2. Cite the metrics and comparisons supporting each recommendation.
3. Every speed mentioned in summary, observed_facts, technical_recommendations, or next_session_pace_guidance MUST be expressed as min:sec/km pace in French format (for example, "4:12/km" or "4:12 /km"). Never use m/s or km/h in textual output. You may reason internally in other units, but all output text must use min/km pace.
4. Fill next_session_pace_guidance.recommendedPaceDisplay with the recommended min:sec /km pace. Keep recommendedPaceMps only as the internal numeric value.
5. For exercises, provide concrete structure (duration, reps, intensity zone).
6. Distinguish facts (observed), comparisons (historical), and hypotheses.
7. Always include limitations and data gaps.
8. Round all numeric values to the nearest integer for heart rate, to the nearest second for pace values, and to the nearest whole percentage in prose and JSON where relevant.
9. Merge any clarifications that affect reliability into limitations instead of listing redundant future-session suggestions. Keep recommendations and future-session guidance distinct but non-duplicative.
10. When a dynamic threshold confidence is insufficient or low and the user-declared reference is used as fallback, explicitly state that the value comes from the declared reference and not from the computed threshold.

OUTPUT FORMAT: Valid JSON matching the provided schema.
Respond with ONLY the JSON object, no markdown wrapper or additional text.`;

const PROMPT_VERSION = "1.0";
// const MODEL = "gemini-3.5-flash-lite";
const MODEL =  "gemini-3.8-flash";
// const MODEL = process.env.GEMINI_MODEL

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

  async analyzeConversation(context: ConversationContext): Promise<{ response: z.infer<typeof conversationResponseSchema>; model: string; promptVersion: string }> {
    const systemInstruction = `You are the data-grounded running assistant for Run Insights.
Use only the structured context provided. Distinguish facts, comparisons, hypotheses, limitations, and missing data.
Never diagnose injury, illness, pain, overtraining, or medical conditions.
Never invent metrics or claim certainty beyond the context. Cite activity IDs in evidence.
Return only valid JSON matching the requested schema.`;
    let responseText: string;
    try {
      const client = new GoogleGenAI({ apiKey: this.apiKey });
      let response: Awaited<ReturnType<typeof client.models.generateContent>> | undefined;
      const prompt = `Answer this running question using only the structured context:\n\n${JSON.stringify(context, null, 2)}`;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          response = await client.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: { systemInstruction, responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(conversationResponseSchema) },
          });
          break;
        } catch (error) {
          const rawError = error as { status?: unknown; message?: unknown };
          const message = typeof rawError.message === "string" ? rawError.message : "Unknown error";
          if (!(rawError.status === 503 || /\b503\b|UNAVAILABLE/.test(message)) || attempt === RETRY_DELAYS_MS.length) throw error;
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }
      if (!response?.text) throw new InvalidResponseError("Gemini conversation response had no text payload");
      responseText = response.text;
    } catch (error) {
      throw error;
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new InvalidResponseError("No JSON found in conversation response");
    let parsedResponse: unknown;
    try { parsedResponse = JSON.parse(jsonMatch[0]); } catch (error) { throw new InvalidResponseError(`Failed to parse conversation JSON: ${error instanceof Error ? error.message : "unknown"}`); }
    const validatedResponse = conversationResponseSchema.safeParse(parsedResponse);
    if (!validatedResponse.success) throw new InvalidResponseError("Conversation response validation failed", validatedResponse.error.issues);
    return { response: validatedResponse.data, model: MODEL, promptVersion: PROMPT_VERSION };
  }
}

export { GeminiClientError, InvalidResponseError };
