# King Mongkut Social - Frontend integration contract

Backend base URL (development): `http://localhost:4000/api/v1`

## Authentication model

1. Navigate the browser to `GET /auth/google?returnTo=/local/path` (not a Fetch request).
2. Google redirects to the API callback. The API verifies identity, links/creates the user, sets an HttpOnly refresh cookie and redirects to the frontend `/auth/callback?returnTo=...`.
3. On startup, call `POST /auth/refresh` once with `credentials: 'include'`. The response contains `data.user` and `data.accessToken`. Keep the access token in memory only.
4. If `user.needsProfileCompletion` is true, show `/complete-profile` and submit `PATCH /auth/profile` with `{ faculty, department }` using the bearer token. Both fields are required, trimmed strings of 1–150 characters. The response is `{ success: true, data: { user } }` with the updated user.
5. Member APIs (private posts and friends) return `403 PROFILE_INCOMPLETE` until the profile is complete. `/auth/me`, `/auth/profile`, refresh/logout and public post reads remain available. Incomplete profiles cannot use optional authentication to read private drafts.
6. After completion, navigate to a validated local `returnTo`, defaulting to `/dashboard`. Reject external URLs and auth routes that would loop.
7. On an expired access token, refresh once, replace the in-memory token and retry. Refresh sessions rotate and cannot be reused. Logout revokes the current refresh session.
8. `/auth/login` and `/auth/register` return `410 GOOGLE_LOGIN_REQUIRED`. Old token versions are invalid after this deployment.

Google failures redirect to `/login?error=CODE&returnTo=...`. Supported codes include `UNIVERSITY_EMAIL_REQUIRED`, `GOOGLE_CANCELLED`, `GOOGLE_SESSION_EXPIRED`, `GOOGLE_IDENTITY_INVALID`, `GOOGLE_ACCOUNT_CONFLICT`, `ACCOUNT_INACTIVE`, `GOOGLE_NOT_CONFIGURED`, and `GOOGLE_LOGIN_FAILED`. Render fixed Thai messages for these codes, never raw provider error descriptions.

Allowed email domains: `kmitl.ac.th`, `mail.kmutt.ac.th`, `email.kmutnb.ac.th`. Email and university are set by the API; the frontend cannot change them via profile input. Google subject and password hash are never included in user JSON. Faculty and department come from the API, not localStorage.

See [Google OAuth setup and rollout](google-auth.md).

## Core response envelope

```ts
export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

## Suggested frontend types

```ts
export type Role = 'user' | 'admin';
export type PostStatus = 'draft' | 'published';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  university: 'KMITL' | 'KMUTNB' | 'KMUTT';
  faculty?: string;
  department?: string;
  needsProfileCompletion: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Post {
  _id: string;
  title: string;
  content: string;
  status: PostStatus;
  author: string | { _id: string; name: string };
  createdAt: string;
  updatedAt: string;
}
```

## Posts

- `GET /posts?page=1&limit=20&search=...` — public published list
- `GET /posts/mine?page=1&limit=20&search=...` — current user's drafts + published posts
- `GET /posts/:id` — published post; authenticated owner/admin can also read a draft
- `POST /posts` — authenticated
- `PATCH /posts/:id` — owner/admin
- `DELETE /posts/:id` — owner/admin
