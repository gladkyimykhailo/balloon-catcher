export const integer = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
export function shuffled(values, rng) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = integer(rng, 0, i); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function options(stage, correct, alternatives, rng) {
  const others = shuffled([...new Set(alternatives.map(String))].filter(v => v !== String(correct)), rng).slice(0, 3);
  if (others.length !== 3) throw new Error('A challenge needs three distinct decoys');
  stage.choices = shuffled([String(correct), ...others], rng); stage.answer = stage.choices.indexOf(String(correct));
  return stage;
}
export function numbers(stage, correct, rng) {
  return options(stage, correct, Array.from({ length: 13 }, (_, i) => correct + i - 6), rng);
}
