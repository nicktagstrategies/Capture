import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../lib/env.js';

const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
}

/**
 * Verify an Apple identity token issued by Sign in with Apple on iOS.
 * Returns the claims on success, throws on failure.
 */
export async function verifyAppleIdToken(idToken: string): Promise<AppleIdTokenClaims> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: 'https://appleid.apple.com',
    audience: env.APPLE_CLIENT_ID,
  });
  return payload as AppleIdTokenClaims;
}
