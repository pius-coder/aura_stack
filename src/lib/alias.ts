const ANIMALS = [
  "lion", "aigle", "panthère", "éléphant", "gazelle", "faucon", "tigre", "loup",
  "ours", "cobra", "hibou", "dauphin", "renard", "cerf", "lynx", "bison",
  "puma", "jaguar", "colibri", "héron", "vautour", "cygne", "phénix", "dragon",
  "tortue", "requin", "baleine", "perroquet", "flamant", "pélican",
];

const ADJECTIVES = [
  "rapide", "calme", "vif", "fort", "sage", "noble", "brave", "doux", "fier",
  "grand", "agile", "rusé", "loyal", "libre", "ardent", "serein", "hardi",
  "subtil", "vaste", "clair", "pur", "juste", "prompt", "souple", "ferme",
];

export function generateAlias(): string {
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const num = String(Math.floor(1000 + Math.random() * 9000));
  return `${animal}-${adj}-${num}`;
}
