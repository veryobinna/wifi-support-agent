export function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasAny(normalizedInput: string, phrases: string[]): boolean {
  return phrases.some((phrase) => {
    const escapedPhrase = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
    const phrasePattern = new RegExp(`(^|\\s)${escapedPhrase}(?=\\s|$)`);

    return phrasePattern.test(normalizedInput);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
