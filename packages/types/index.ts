export type UserRole = "ADMIN" | "STAFF" | "CLIENT";

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
