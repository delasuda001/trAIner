import { describe, expect, it } from "vitest";
import { conversationResponseSchema } from "./schemas";

describe("conversationResponseSchema", () => {
  it("rejette une réponse conversationnelle incomplète", () => {
    expect(conversationResponseSchema.safeParse({ summary: "incomplet" }).success).toBe(false);
  });
});