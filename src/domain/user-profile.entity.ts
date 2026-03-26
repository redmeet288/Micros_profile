import type { RoleValue } from "./role";

export type UserProfileStatus = "ACTIVE" | "INACTIVE" | "BANNED" | "BUSY";

export interface UserProfile {
  userUuid: string;
  roles: RoleValue[];
  stack: string[];
  specialization: string[];
  telegramId?: number | null;
  status: UserProfileStatus;
}
