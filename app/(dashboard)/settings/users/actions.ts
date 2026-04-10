"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { generatePassword } from "@/lib/password"
import {
  createUserSchema,
  updateUserPermissionsSchema,
  type CreateUserInput,
  type UpdateUserPermissionsInput,
} from "@/lib/validations/user-management"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createUser(
  raw: CreateUserInput
): Promise<ActionResult<{ id: string; generatedPassword: string }>> {
  const parsed = createUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { email, name, permissions, eventIds } = parsed.data

  const rawPassword = generatePassword()
  const hashedPassword = await bcrypt.hash(rawPassword, 12)

  try {
    const user = await db.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: "Staff",
        mustChangePassword: true,
        requiresTotpSetup: true,
        permissions: {
          create: permissions.map((feature) => ({ feature })),
        },
        eventAccess: {
          create: eventIds.map((eventId) => ({ eventId })),
        },
      },
      select: { id: true },
    })

    revalidatePath("/settings/users")
    return { success: true, data: { id: user.id, generatedPassword: rawPassword } }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "An account with this email already exists" }
    }
    return { success: false, error: "Failed to create user" }
  }
}

export async function updateUserPermissions(
  id: string,
  raw: UpdateUserPermissionsInput
): Promise<ActionResult> {
  const parsed = updateUserPermissionsSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { permissions, eventIds } = parsed.data

  try {
    await db.$transaction([
      // Replace all permissions
      db.userPermission.deleteMany({ where: { userId: id } }),
      ...(permissions.length > 0
        ? [db.userPermission.createMany({ data: permissions.map((feature) => ({ userId: id, feature })) })]
        : []),
      // Replace all event access
      db.userEventAccess.deleteMany({ where: { userId: id } }),
      ...(eventIds.length > 0
        ? [db.userEventAccess.createMany({ data: eventIds.map((eventId) => ({ userId: id, eventId })) })]
        : []),
    ])

    revalidatePath("/settings/users")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update permissions" }
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  try {
    await db.user.delete({ where: { id } })
    revalidatePath("/settings/users")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete user" }
  }
}
