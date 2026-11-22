import { describe, expect, it } from "vitest";
import { buildProgram } from "./cli";

describe("ladder CLI", () => {
  it("is named ladder", () => {
    expect(buildProgram().name()).toBe("ladder");
  });

  it("reports a semver version", () => {
    expect(buildProgram().version()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("describes the project in its help", () => {
    const help = buildProgram().helpInformation();
    expect(help).toContain("Usage: ladder");
    expect(help).toContain("A worked example of the design ladder");
  });
});
