import type { University } from '../users/user.model.js';

const DOMAIN_TO_UNIVERSITY: Readonly<Record<string, University>> = {
  'kmitl.ac.th': 'KMITL',
  'mail.kmutt.ac.th': 'KMUTT',
  'email.kmutnb.ac.th': 'KMUTNB',
};

export const INSTITUTION_DOMAINS = {
  KMITL: 'kmitl.ac.th',
  KMUTT: 'mail.kmutt.ac.th',
  KMUTNB: 'email.kmutnb.ac.th',
} as const;

export function universityForEmail(email: string): University | null {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0 || separator === normalized.length - 1) return null;
  const domain = normalized.slice(separator + 1);
  return DOMAIN_TO_UNIVERSITY[domain] ?? null;
}

export function isAllowedInstitutionEmail(email: string): boolean {
  return universityForEmail(email) !== null;
}
