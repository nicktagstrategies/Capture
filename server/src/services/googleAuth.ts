import { OAuth2Client } from 'google-auth-library';
import { env } from '../lib/env.js';

const client = new OAuth2Client();

export interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdTokenClaims> {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_IOS_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error('invalid google token');
  return payload as GoogleIdTokenClaims;
}
