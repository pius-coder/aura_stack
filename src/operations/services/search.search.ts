import { defineSearchIndex } from "@/aura/server/search";

defineSearchIndex("Service", {
  fields: ["title", "description"],
  filterFields: ["isActive", "availability", "zone"],
  language: "french",
});
