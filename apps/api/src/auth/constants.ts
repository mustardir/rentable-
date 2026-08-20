export const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES || '15m';
export const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES || '30d';

export const JWT_ACCESS_SECRET = process.env.JWT_SECRET;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export function assertJwtConfiguration(): void {
  if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in environment');
  }
}
