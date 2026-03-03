Run a Prisma migration in development. Creates a new migration file and applies it to the local database.

Usage: /db-migrate <migration-name>

Steps:
1. Run `pnpm prisma migrate dev --name $ARGUMENTS`
2. Confirm the migration was applied successfully
3. If there are schema drift warnings, surface them to the user before proceeding
