import type { Contract } from "./contract";

/**
 * Renders a contract for a prompt: each paragraph prefixed with its `[N.M]` marker, so the model
 * can cite the paragraph a value came from.
 */
export function renderContractForPrompt(contract: Contract): string {
  const sections = contract.sections.map((section) =>
    [
      `## ${section.number}. ${section.heading}`,
      ...section.paragraphs.map((paragraph) => `[${paragraph.id}] ${paragraph.text}`),
    ].join("\n"),
  );
  return [
    `<contract id="${contract.id}">`,
    `# ${contract.title}`,
    "",
    sections.join("\n\n"),
    "</contract>",
  ].join("\n");
}
