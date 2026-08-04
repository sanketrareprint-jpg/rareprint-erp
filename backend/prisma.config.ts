import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Deliberately not using the `env()` helper from "prisma/config" here:
    // it throws if DATABASE_URL isn't set, but `prisma generate` runs during
    // the Docker *build* step, before Railway injects the runtime
    // DATABASE_URL — so this needs a safe fallback instead of throwing.
    url: process.env.DATABASE_URL ?? "",
  },
});
