ALTER TABLE "custom_roles" ADD COLUMN "isTemplate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "custom_roles" ADD COLUMN "baseTemplateId" UUID;
ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_baseTemplateId_fkey" FOREIGN KEY ("baseTemplateId") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
