import "dotenv/config";
import { defineConfig } from "prisma/config";

const { PGHOST_UNPOOLED, PGUSER, PGPASSWORD, PGDATABASE } = process.env
const migrationUrl = `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST_UNPOOLED}/${PGDATABASE}?sslmode=require`

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
