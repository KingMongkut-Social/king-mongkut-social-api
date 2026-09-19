import { describe, expect, it } from 'vitest';
import { universityForEmail } from '../src/modules/auth/institution.js';

describe('universityForEmail', () => {
  it('maps the three allowed university domains', () => {
    expect(universityForEmail('student@kmitl.ac.th')).toBe('KMITL');
    expect(universityForEmail('student@mail.kmutt.ac.th')).toBe('KMUTT');
    expect(universityForEmail('student@email.kmutnb.ac.th')).toBe('KMUTNB');
  });

  it('rejects consumer and lookalike domains', () => {
    expect(universityForEmail('student@gmail.com')).toBeNull();
    expect(universityForEmail('student@sub.kmitl.ac.th')).toBeNull();
    expect(universityForEmail('student@kmitl.ac.th.example.com')).toBeNull();
  });
});
