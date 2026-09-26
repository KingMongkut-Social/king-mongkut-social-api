import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error.js';
import { sha256 } from '../../common/utils/hash.js';
import { env } from '../../config/env.js';
import { OAuthTransactionModel } from './oauth-transaction.model.js';
import { safeReturnTo } from './return-to.js';
import { isUniversityWorkspace, universityForEmail } from './university-email.js';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const OAUTH_TTL_MS = 10 * 60 * 1000;

const claimsSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.email().transform((email) => email.toLowerCase()),
  email_verified: z.literal(true),
  hd: z.string().min(1),
  nonce: z.string().min(1),
  name: z.string().optional(),
  exp: z.number(),
  iat: z.number(),
});

export function validateGoogleClaims(payload: JWTPayload, expectedNonce: string) {
  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success || parsed.data.nonce !== expectedNonce
    || (payload.azp !== undefined && payload.azp !== env.GOOGLE_CLIENT_ID)
    || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== env.GOOGLE_CLIENT_ID)) {
    throw new AppError(401, 'GOOGLE_IDENTITY_INVALID', 'Google identity could not be verified');
  }
  const claims = parsed.data;
  const university = universityForEmail(claims.email);
  if (!university || !isUniversityWorkspace(claims.hd, university)) {
    throw new AppError(403, 'UNIVERSITY_EMAIL_REQUIRED', 'Use a supported university Google account');
  }
  const name = claims.name?.trim().slice(0, 80);
  return {
    sub: claims.sub, email: claims.email, university,
    name: name && name.length >= 2 ? name : claims.email.slice(0, 80),
  };
}

export type GoogleIdentity = ReturnType<typeof validateGoogleClaims>;

export async function verifyGoogleIdToken(idToken: string, nonce: string): Promise<GoogleIdentity> {
  try {
    const { payload } = await jwtVerify(idToken, googleKeys, {
      algorithms: ['RS256'], issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: env.GOOGLE_CLIENT_ID, requiredClaims: ['exp', 'iat', 'sub'],
    });
    return validateGoogleClaims(payload, nonce);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, 'GOOGLE_IDENTITY_INVALID', 'Google identity could not be verified');
  }
}

export async function startGoogleLogin(returnTo: unknown) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured');
  }
  const state = randomBytes(32).toString('base64url');
  const binding = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  await OAuthTransactionModel.create({
    stateHash: sha256(state), bindingHash: sha256(binding), nonce, codeVerifier,
    returnTo: safeReturnTo(returnTo), expiresAt: new Date(Date.now() + OAUTH_TTL_MS),
  });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: 'openid email profile', prompt: 'select_account', hd: '*',
    state, nonce, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
  }).toString();
  return { url: url.toString(), binding };
}

export async function consumeGoogleTransaction(state: unknown, binding: unknown) {
  if (typeof state !== 'string' || typeof binding !== 'string'
    || !/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(binding)) {
    throw new AppError(400, 'GOOGLE_SESSION_EXPIRED', 'Start Google sign-in again');
  }
  // Consume atomically. MongoDB TTL cleanup alone does not enforce expiration.
  const transaction = await OAuthTransactionModel.findOneAndDelete({
    stateHash: sha256(state), bindingHash: sha256(binding), expiresAt: { $gt: new Date() },
  });
  if (!transaction) throw new AppError(400, 'GOOGLE_SESSION_EXPIRED', 'Start Google sign-in again');
  return transaction;
}

export async function exchangeGoogleCode(code: unknown, codeVerifier: string, nonce: string) {
  if (typeof code !== 'string' || !code || code.length > 4096) {
    throw new AppError(400, 'GOOGLE_LOGIN_FAILED', 'Google sign-in failed');
  }
  let idToken: string;
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI, grant_type: 'authorization_code',
        code, code_verifier: codeVerifier,
      }),
    });
    if (!response.ok) throw new Error('Token exchange failed');
    const data = z.object({ id_token: z.string().min(1) }).parse(await response.json());
    idToken = data.id_token;
  } catch {
    // Provider errors can contain codes and secrets; never expose or log them.
    throw new AppError(502, 'GOOGLE_LOGIN_FAILED', 'Google sign-in failed; please try again');
  }
  return verifyGoogleIdToken(idToken, nonce);
}
