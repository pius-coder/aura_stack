/**
 * Seed script — populates the DB with realistic Cameroon-based test data.
 * Run: bun scripts/seed.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const CITIES = ["Yaoundé", "Douala", "Bafoussam", "Bamenda", "Garoua"];
const SKILLS = [
  "Plombier", "Électricien", "Menuisier", "Peintre", "Maçon",
  "Graphiste", "Développeur web", "Photographe", "Coiffeur", "Mécanicien",
  "Couturier", "Traiteur", "Jardinier", "Chauffeur", "Comptable",
  "Avocat", "Architecte", "Soudeur", "Carreleur", "Climaticien",
];
const ADJECTIVES = ["rapide", "calme", "vif", "fort", "sage", "noble", "brave", "doux", "fier", "grand"];
const ANIMALS = ["lion", "aigle", "panthère", "éléphant", "gazelle", "faucon", "tigre", "loup", "ours", "cobra"];

function randomAlias() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = String(Math.floor(1000 + Math.random() * 9000));
  return `${animal}-${adj}-${num}`;
}

function randomPhone() {
  const prefix = Math.random() > 0.5 ? "6" : "6";
  const rest = String(Math.floor(10000000 + Math.random() * 90000000));
  return `+237${prefix}${rest.slice(0, 8)}`;
}

async function main() {
  console.log("🌱 Seeding...");

  // Admin
  const admin = await db.auraUser.create({ data: { isAdmin: true } });
  await db.auraPhoneIdentity.create({
    data: { userId: admin.id, countryCode: "+237", nationalNumber: "600000000", phoneE164: "+237600000000", verifiedAt: new Date(), whatsappVerifiedAt: new Date() },
  });
  await db.profile.create({
    data: { userId: admin.id, displayName: "Admin Vibe", alias: "admin-vibe-0001", language: "FR", isProvider: false, isClient: false, status: "ACTIVE", locationLabel: "Yaoundé" },
  });

  // 20 providers
  const providerIds: string[] = [];
  for (let i = 0; i < 20; i++) {
    const phone = randomPhone();
    const user = await db.auraUser.create({ data: {} });
    await db.auraPhoneIdentity.create({
      data: { userId: user.id, countryCode: "+237", nationalNumber: phone.slice(4), phoneE164: phone, verifiedAt: new Date(), whatsappVerifiedAt: new Date() },
    });
    const city = CITIES[i % CITIES.length];
    const alias = randomAlias();
    await db.profile.create({
      data: { userId: user.id, displayName: `Prestataire ${i + 1}`, alias, language: i % 3 === 0 ? "EN" : "FR", isProvider: true, isClient: false, status: "ACTIVE", locationLabel: city, bio: `Professionnel basé à ${city}.` },
    });
    // 1-3 services
    const numServices = 1 + Math.floor(Math.random() * 3);
    for (let s = 0; s < numServices; s++) {
      const skill = SKILLS[(i * 3 + s) % SKILLS.length];
      await db.service.create({
        data: { userId: user.id, title: skill, description: `Service de ${skill.toLowerCase()} professionnel à ${city}.`, priceXaf: 5000 + Math.floor(Math.random() * 50000), zone: city, availability: "AVAILABLE" },
      });
    }
    providerIds.push(user.id);
  }

  // 30 clients
  const clientIds: string[] = [];
  for (let i = 0; i < 30; i++) {
    const phone = randomPhone();
    const user = await db.auraUser.create({ data: {} });
    await db.auraPhoneIdentity.create({
      data: { userId: user.id, countryCode: "+237", nationalNumber: phone.slice(4), phoneE164: phone, verifiedAt: new Date(), whatsappVerifiedAt: new Date() },
    });
    const city = CITIES[i % CITIES.length];
    await db.profile.create({
      data: { userId: user.id, displayName: `Client ${i + 1}`, alias: randomAlias(), language: "FR", isProvider: false, isClient: true, status: "ACTIVE", locationLabel: city },
    });
    clientIds.push(user.id);
  }

  // 5 matches (PENDING)
  for (let i = 0; i < 5; i++) {
    await db.match.create({
      data: { requesterId: clientIds[i], targetId: providerIds[i], status: "PENDING" },
    });
  }

  console.log("✅ Seed complete: 1 admin, 20 providers, 30 clients, 5 matches.");
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
