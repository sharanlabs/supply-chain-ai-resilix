import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL?.trim();
const commandRequiresDatabase = process.argv.some((arg) => arg === "push");

if (commandRequiresDatabase && !databaseUrl) {
  throw new Error("DATABASE_URL is required for `npm run db:push`.");
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "postgres://placeholder:placeholder@localhost:5432/resilix"
  }
});
