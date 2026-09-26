import type { University } from '../users/user.model.js';

const domains = new Map<string, University>([
  ['kmitl.ac.th', 'KMITL'],
  ['mail.kmutt.ac.th', 'KMUTT'],
  ['email.kmutnb.ac.th', 'KMUTNB'],
]);

const workspaceRoots: Record<University, string> = {
  KMITL: 'kmitl.ac.th', KMUTT: 'kmutt.ac.th', KMUTNB: 'kmutnb.ac.th',
};

export function universityForEmail(email: string): University | undefined {
  const parts = email.toLowerCase().split('@');
  return parts.length === 2 && parts[0] ? domains.get(parts[1] ?? '') : undefined;
}

export function isUniversityWorkspace(hostedDomain: string, university: University): boolean {
  const root = workspaceRoots[university];
  const domain = hostedDomain.toLowerCase();
  return domain === root || domain.endsWith('.' + root);
}
