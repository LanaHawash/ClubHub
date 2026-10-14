import {
  createHash,
  randomBytes,
} from 'node:crypto';

export const REFRESH_TOKEN_LIFETIME_DAYS = 7;

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}

export function getRefreshTokenExpiration(): Date {
  const milliseconds =
    REFRESH_TOKEN_LIFETIME_DAYS *
    24 *
    60 *
    60 *
    1000;

  return new Date(Date.now() + milliseconds);
}