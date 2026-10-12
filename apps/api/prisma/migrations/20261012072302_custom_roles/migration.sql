-- AlterTable
ALTER TABLE "users" ADD COLUMN     "customRoleId" UUID;

-- CreateTable
CREATE TABLE "custom_roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseRole" "Role" NOT NULL,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_roles_name_key" ON "custom_roles"("name");

-- CreateIndex
CREATE INDEX "users_customRoleId_idx" ON "users"("customRoleId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
