import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LlmProvider } from "@/types";
import { nextMockResponse } from "@/llm/mock";

const DEFAULT_MAX_OUTPUT_TOKENS = 6000;

if (process.env.AI_SDK_LOG_WARNINGS === undefined) {
  // Keep CLI stdout clean for piping/redirecting generated markdown.
  process.env.AI_SDK_LOG_WARNINGS = "false";
}

export interface LlmRequest {
  prompt: string;
  provider: LlmProvider;
  system?: string;
  model: string;
  maxOutputTokens?: number;
  apiKey?: string;
}

export interface LlmResponse {
  content: string;
}

export async function generateDraftWithLlm(request: LlmRequest): Promise<LlmResponse> {
  const mockResponse = nextMockResponse();
  if (typeof mockResponse === "string") {
    return {
      content: mockResponse,
    };
  }

  if (!request.prompt.trim()) {
    throw new Error("LLM request prompt cannot be empty.");
  }

  const providerName = request.provider;
  const modelId = request.model.trim();
  if (!modelId) {
    throw new Error("LLM request model cannot be empty.");
  }
  let model:
    | ReturnType<ReturnType<typeof createOpenAI>>
    | ReturnType<ReturnType<typeof createAnthropic>>;

  if (providerName === "openai") {
    const provider = createOpenAI({
      apiKey: request.apiKey,
    });
    model = provider(modelId);
  } else {
    const provider = createAnthropic({
      apiKey: request.apiKey,
    });
    model = provider(modelId);
  }

  const response = await generateText({
    model,
    system: request.system,
    prompt: request.prompt,
    maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  });

  return {
    content: response.text,
  };
}
