let cachedMockResponsesEnv: string | undefined;
let cachedMockResponses: string[] = [];
let cachedMockResponseIndex = 0;

export function nextMockResponse(): string | undefined {
  const mockResponsesEnv = process.env.SKILLSMITH_LLM_MOCK_RESPONSES;
  if (mockResponsesEnv !== undefined) {
    if (mockResponsesEnv !== cachedMockResponsesEnv) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(mockResponsesEnv) as unknown;
      } catch (error) {
        throw new Error(
          `SKILLSMITH_LLM_MOCK_RESPONSES must be a JSON array of strings: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
        throw new Error("SKILLSMITH_LLM_MOCK_RESPONSES must be a JSON array of strings.");
      }

      cachedMockResponsesEnv = mockResponsesEnv;
      cachedMockResponses = parsed;
      cachedMockResponseIndex = 0;
    }

    if (cachedMockResponseIndex >= cachedMockResponses.length) {
      throw new Error(
        "SKILLSMITH_LLM_MOCK_RESPONSES did not provide enough responses for this run.",
      );
    }

    const response = cachedMockResponses[cachedMockResponseIndex];
    cachedMockResponseIndex += 1;
    return response;
  }

  const mockResponse = process.env.SKILLSMITH_LLM_MOCK_RESPONSE;
  if (typeof mockResponse === "string") {
    return mockResponse;
  }

  return undefined;
}
