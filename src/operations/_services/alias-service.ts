import { AuraService } from "@/aura/server/service";
import { generateAlias } from "@/lib/alias";

export class AliasService extends AuraService {
  async generateUnique(language: "FR" | "EN" = "FR"): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const alias = generateAlias(language);
      const exists = await this.db.profile.findUnique({ where: { alias } });
      if (!exists) return alias;
    }
    return generateAlias(language) + "-" + Date.now().toString(36);
  }
}
