ALTER TABLE "role_permissions" ADD COLUMN "templateDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "custom_roles" ADD COLUMN "baseRoles" "Role"[] NOT NULL DEFAULT ARRAY[]::"Role"[];
CREATE TABLE "custom_role_sources" (
  "roleId" UUID NOT NULL REFERENCES "custom_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "templateId" UUID NOT NULL REFERENCES "custom_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("roleId", "templateId")
);
CREATE INDEX "custom_role_sources_templateId_idx" ON "custom_role_sources"("templateId");
INSERT INTO "custom_role_sources" ("roleId", "templateId") SELECT "id", "baseTemplateId" FROM "custom_roles" WHERE "baseTemplateId" IS NOT NULL AND "isTemplate" = false;
UPDATE "custom_roles" SET "baseRoles" = ARRAY["baseRole"] WHERE "baseTemplateId" IS NULL AND "isTemplate" = false;
