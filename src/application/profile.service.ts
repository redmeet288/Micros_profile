import type { Prisma } from "@prisma/client";
import type { RoleValue } from "../domain/role";
import { Role } from "../domain/role";
import prisma from "../infrastructure/prisma";

export class ProfileService {
    async getProfileByUserUuid(userUuid: string) {
        return prisma.userProfile.findUnique({
            where: { userUuid },
        });
    }

    async createProfileByUserUuid(
        userUuid: string,
        data: {
            username: string;
            email?: string;
            fullName?: string;
        }
    ) {
        const createData: Prisma.UserProfileUncheckedCreateInput = {
            userUuid,
            username: data.username,
            email: data.email ?? null,
            fullName: data.fullName ?? null,
            roles: [Role.EXECUTOR],
            stack: [],
            specialization: [],
            experienceLevel: "JUNIOR",
            status: "ACTIVE",
            rating: 0.0,
            completedJobs: 0,
        };

        return prisma.userProfile.create({ data: createData });
    }

    async connectTelegram(userUuid: string, telegramId: number) {
        return prisma.userProfile.update({
            where: { userUuid },
            data: { telegramId },
        });
    }

    async getUserUuidByUsername(
        username: string
    ): Promise<string | null> {
        const profile = await prisma.userProfile.findUnique({
            where: { username },
            select: { userUuid: true },
        });

        return profile?.userUuid ?? null;
    }

    async updateProfile(userUuid: string, data: Record<string, unknown>) {
        const updateData: Record<string, unknown> = {};

        const textFields = [
            "username",
            "email",
            "fullName",
            "bio",
            "avatarUrl",
            "location",
            "experienceLevel",
            "status",
        ] as const;

        for (const field of textFields) {
            if (data[field] !== undefined) {
                const v = data[field];
                updateData[field] =
                    v === null || v === "" ? null : String(v);
            }
        }

        if (data.specialization !== undefined) {
            if (Array.isArray(data.specialization)) {
                updateData.specialization = data.specialization;
            } else if (typeof data.specialization === "string") {
                updateData.specialization = [data.specialization];
            } else {
                updateData.specialization = [];
            }
        }

        if (data.stack !== undefined) {
            if (Array.isArray(data.stack)) {
                updateData.stack = data.stack;
            } else if (typeof data.stack === "string") {
                updateData.stack = data.stack
                    .split(",")
                    .map((item: string) => item.trim());
            } else {
                updateData.stack = [];
            }
        }

        if (data.telegramId !== undefined) {
            const telegramIdNum = Number(data.telegramId);
            updateData.telegramId = isNaN(telegramIdNum)
                ? null
                : telegramIdNum;
        }

        try {
            return await prisma.userProfile.update({
                where: { userUuid },
                data: updateData as Prisma.UserProfileUpdateInput,
            });
        } catch (error: unknown) {
            console.error("Error code:", (error as { code?: string }).code);
            console.error("Error meta:", (error as { meta?: unknown }).meta);
            throw error;
        }
    }

    async updateRolesByUserUuid(
        userUuid: string,
        roles: RoleValue[]
    ) {
        return prisma.userProfile.update({
            where: { userUuid },
            data: { roles },
        });
    }
}
