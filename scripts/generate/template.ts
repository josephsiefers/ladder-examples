const PLACEHOLDER = /\{\{([a-zA-Z][\w.]*)\}\}/g;
const BRACE = /[{}]/;

/**
 * Fills `{{name}}` placeholders from `values`. An unknown placeholder, or any brace left over from
 * a malformed one, fails generation: a contract must never ship with a gap. `label` names the
 * template in the error.
 */
export function fillTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
  label: string,
): string {
  const unfilled = template.replaceAll(PLACEHOLDER, "");
  if (BRACE.test(unfilled)) {
    throw new Error(`Template '${label}': unfilled placeholder in '${template}'.`);
  }
  return template.replaceAll(PLACEHOLDER, (placeholder, name: string) => {
    const value = values[name];
    if (value === undefined) {
      throw new Error(`Template '${label}': unknown placeholder ${placeholder}.`);
    }
    return value;
  });
}
