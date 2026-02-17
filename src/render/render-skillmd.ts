import type { SpecIR } from "@/ir/ir-types";

export function renderSkillMarkdown(_specIR: SpecIR): string {
  throw new Error(
    "Deterministic rendering is disabled. Use LLM generation through the pipeline instead.",
  );
}
