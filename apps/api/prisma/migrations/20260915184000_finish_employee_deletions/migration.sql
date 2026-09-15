-- Employees deleted before this release were only deactivated: the employee
-- row got deletedAt, the login lost isActive, and the unique email stayed
-- taken, so the same address could never be registered again. Apply the
-- current deletion to them so it is free.

-- Nothing of their own to keep: the login goes and the cascades do the rest.
DELETE FROM "users" u
USING "employees" e
WHERE e."userId" = u."id"
  AND e."deletedAt" IS NOT NULL
  AND u."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "comments" c WHERE c."userId" = u."id")
  AND NOT EXISTS (SELECT 1 FROM "timesheet_entries" t WHERE t."employeeId" = e."id");

-- Their timesheets or comments stay: the row is retired and its address
-- tombstoned, the same way the API now does it.
-- Prisma stores these columns in UTC; a bare now() would be server-local.
UPDATE "users" u
SET "deletedAt" = (now() AT TIME ZONE 'UTC'),
    "isActive" = false,
    "email" = u."email" || '.deleted.' || (extract(epoch FROM now()) * 1000)::bigint
FROM "employees" e
WHERE e."userId" = u."id"
  AND e."deletedAt" IS NOT NULL
  AND u."deletedAt" IS NULL;
