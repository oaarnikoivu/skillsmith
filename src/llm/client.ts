import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LlmProvider } from "@/types";

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
  temperature?: number;
  maxOutputTokens?: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface LlmResponse {
  content: string;
}

let cachedMockResponsesEnv: string | undefined;
let cachedMockResponses: string[] = [];
let cachedMockResponseIndex = 0;

function nextMockResponse(): string | undefined {
  const mockResponsesEnv = process.env.OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSES;
  if (mockResponsesEnv !== undefined) {
    if (mockResponsesEnv !== cachedMockResponsesEnv) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(mockResponsesEnv) as unknown;
      } catch (error) {
        throw new Error(
          `OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSES must be a JSON array of strings: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
        throw new Error("OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSES must be a JSON array of strings.");
      }

      cachedMockResponsesEnv = mockResponsesEnv;
      cachedMockResponses = parsed;
      cachedMockResponseIndex = 0;
    }

    if (cachedMockResponseIndex >= cachedMockResponses.length) {
      throw new Error(
        "OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSES did not provide enough responses for this run.",
      );
    }

    const response = cachedMockResponses[cachedMockResponseIndex];
    cachedMockResponseIndex += 1;
    return response;
  }

  const mockResponse = process.env.OPENAPI_TO_SKILLMD_LLM_MOCK_RESPONSE;
  if (typeof mockResponse === "string") {
    return mockResponse;
  }

  return undefined;
}

function supportsTemperature(provider: LlmProvider, modelId: string): boolean {
  if (provider !== "openai") {
    return true;
  }

  return !/^(gpt-5|o1|o3|o4)/i.test(modelId);
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
      baseURL: request.baseUrl,
    });
    model = provider(modelId);
  } else {
    const provider = createAnthropic({
      apiKey: request.apiKey,
    });
    model = provider(modelId);
  }

  const shouldSetTemperature =
    request.temperature !== undefined && supportsTemperature(providerName, modelId);
  const response = await generateText({
    model,
    system: request.system,
    prompt: request.prompt,
    ...(shouldSetTemperature ? { temperature: request.temperature } : {}),
    maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  });

  return {
    content: response.text,
  };
}
