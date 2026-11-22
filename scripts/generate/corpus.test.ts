import { describe, expect, it } from "vitest";
import type { Contract } from "../../src/core/documents";
import { assembleNda } from "./assemble";
import { jurisdictionsNamed, TIME_WORDS } from "./corpus.fixtures";
import { coverage, PLANTS } from "./coverage";
import { readAsFirmContract } from "./generate.fixtures";
import { loadLibrary } from "./library";
import { loadPlantSpecs } from "./plants";

const library = await loadLibrary();
const specs = await loadPlantSpecs();
const ndas = await Promise.all(
  specs.map(async (spec) => {
    const nda = assembleNda(spec, library);
    return { spec, nda, contract: await readAsFirmContract(nda) };
  }),
);

/** The law clause each plant value renders, written out independently of the generator. */
const LAW_NAMES: Record<string, string> = {
  "england-and-wales": "the laws of England and Wales",
  "new-york": "the laws of the State of New York",
  delaware: "the laws of the State of Delaware",
  california: "the laws of the State of California",
  ontario: "the laws of the Province of Ontario",
  singapore: "the laws of the Republic of Singapore",
};

/** What each value-less kind's wordings say, written out independently of the generator. */
const TELLING_PHRASES: Record<string, string[]> = {
  effectiveDate: ["signature"],
  survivalPeriod: ["indefinitely"],
  mutuality: ["to the other", "are discussing"],
};

function inUnit(months: number, unit: "months" | "years"): number {
  return unit === "years" ? months / 12 : months;
}

function paragraphs(contract: Contract) {
  return contract.sections.flatMap((section) => section.paragraphs);
}

describe("the generated NDA corpus", () => {
  it("has 12 dev and 8 test NDAs", () => {
    expect(specs.filter(({ split }) => split === "dev")).toHaveLength(12);
    expect(specs.filter(({ split }) => split === "test")).toHaveLength(8);
  });

  it("meets every plant's coverage minimum: 2 in dev, 1 in test", () => {
    const rows = coverage(specs);
    expect(rows.map(({ plant }) => plant)).toEqual([...PLANTS]);
    expect(rows.filter(({ dev, test }) => dev < 2 || test < 1)).toEqual([]);
  });

  // The collision guard.
  it.each(ndas)("$spec.id names only its planted law and courts", ({ spec, nda }) => {
    const named = jurisdictionsNamed(nda.markdown).toSorted();
    expect(named).toEqual([...new Set([spec.governingLaw, spec.courts])].toSorted());
  });

  it.each(ndas)("$spec.id states no period or date but its planted ones", ({ nda, contract }) => {
    const planted = [
      ...(nda.rendered.term ?? []),
      ...(nda.rendered.survivalPeriod ?? []),
      ...(nda.rendered.effectiveDate ?? []),
    ];
    for (const { text } of paragraphs(contract)) {
      const rest = planted.reduce((remaining, value) => remaining.replaceAll(value, ""), text);
      expect(rest).not.toMatch(TIME_WORDS);
      expect(rest).not.toMatch(/\d/);
    }
  });

  it.each(ndas)("$spec.id has gold equal to its spec", ({ spec, nda }) => {
    const { mutuality, effectiveDate, term, survivalPeriod } = spec;
    const roles =
      mutuality.kind === "mutual"
        ? ["both", "both"]
        : mutuality.discloser === 0
          ? ["discloser", "recipient"]
          : ["recipient", "discloser"];
    expect(nda.goldCase.gold).toEqual({
      parties: spec.parties.map(({ name }, index) => ({ name, role: roles[index] })),
      effectiveDate:
        effectiveDate.kind === "date"
          ? { kind: "date", value: effectiveDate.value }
          : { kind: effectiveDate.kind },
      term:
        term.kind === "fixed"
          ? { kind: "fixed", months: term.months }
          : { kind: "until-terminated", noticeDays: term.noticeDays },
      survivalPeriod:
        survivalPeriod.kind === "fixed"
          ? { kind: "fixed", months: survivalPeriod.months }
          : { kind: "indefinite" },
      governingLaw: spec.governingLaw,
      mutuality: mutuality.kind,
    });
  });

  it.each(ndas)(
    "$spec.id's evidence paragraphs contain the rendered values",
    ({ spec, nda, contract }) => {
      const byId = new Map(paragraphs(contract).map(({ id, text }) => [id, text]));
      const { evidence } = nda.goldCase;
      expect("effectiveDate" in evidence).toBe(spec.effectiveDate.kind !== "not-stated");
      const problems = Object.entries(evidence).flatMap(([field, ids]) => {
        const values = nda.rendered[field as keyof typeof nda.rendered] ?? [];
        if (ids.length === 0) return [`${field}: no evidence paragraphs`];
        return ids.flatMap((id) => {
          const text = byId.get(id);
          if (text === undefined) return [`${field}: no paragraph ${id}`];
          // A kind with no value to render (last signature, indefinite, mutual) has a telling phrase.
          const telling = values.length > 0 ? values : (TELLING_PHRASES[field] ?? []);
          const carries = telling.some((value) => text.includes(value));
          return carries ? [] : [`${field}: ${id} lacks ${values.join(" / ")}`];
        });
      });
      expect(problems).toEqual([]);
    },
  );

  it.each(ndas)("$spec.id renders the values its spec planted", ({ spec, nda }) => {
    const { term, survivalPeriod } = spec;
    expect(nda.rendered.term?.[0]).toContain(
      term.kind === "fixed"
        ? `(${inUnit(term.months, term.unit)}) ${term.unit === "years" ? "year" : "month"}`
        : `(${term.noticeDays}) days`,
    );
    const survivalCount =
      survivalPeriod.kind === "fixed" ? [inUnit(survivalPeriod.months, survivalPeriod.unit)] : [];
    expect(nda.rendered.survivalPeriod?.map((value) => /\((\d+)\)/.exec(value)?.[1])).toEqual(
      survivalCount.map(String),
    );
    expect(nda.rendered.governingLaw).toEqual([LAW_NAMES[spec.governingLaw]]);
  });
});
