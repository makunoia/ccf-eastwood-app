Push the current Prisma schema to the database without creating a migration file. Use this only during early development / prototyping when migration history doesn't matter yet.

Steps:
1. Run `pnpm prisma db push`
2. Run `pnpm prisma generate` to regenerate the client
3. Report any warnings or errors to the user
