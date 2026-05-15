type Language = "FR" | "EN";

const FR: Record<string, string[]> = {
  adjs: ["agile", "ardent", "audacieux", "brave", "calme", "clair", "doux", "ferme", "fier", "grand", "hardi", "juste", "libre", "loyal", "noble", "prompt", "pur", "rapide", "rusé", "serein", "souple", "subtil", "vaste", "vif"],
  nouns: ["aigle", "baleine", "bison", "cerf", "cobra", "colibri", "cygne", "dauphin", "dragon", "éléphant", "faucon", "flamant", "gazelle", "héron", "hibou", "jaguar", "lion", "loup", "lynx", "ours", "panthère", "pélican", "perroquet", "phénix", "puma", "requin", "renard", "tigre", "tortue", "vautour"],
};

const EN: Record<string, string[]> = {
  adjs: ["bold", "bright", "calm", "clear", "fast", "fierce", "firm", "free", "great", "keen", "kind", "loyal", "noble", "proud", "pure", "quick", "quiet", "rapid", "sharp", "silent", "smart", "steady", "subtle", "swift", "wise"],
  nouns: ["archer", "badger", "condor", "eagle", "falcon", "fox", "gazelle", "hawk", "heron", "ibis", "jaguar", "kite", "lion", "lynx", "mantis", "octopus", "owl", "panda", "phoenix", "puma", "raven", "salmon", "swan", "tiger", "viper", "walrus", "wolf", "wren", "yak", "zebra"],
};

export function generateAlias(language: Language = "FR"): string {
  const dict = language === "EN" ? EN : FR;
  const adj = dict.adjs[Math.floor(Math.random() * dict.adjs.length)];
  const noun = dict.nouns[Math.floor(Math.random() * dict.nouns.length)];
  const num = String(Math.floor(1000 + Math.random() * 9000));
  return `${adj}-${noun}-${num}`;
}
