# King Mongkut Social - Frontend integration contract

Backend base URL (development): `http://localhost:4000/api/v1`

## Authentication model

1. `POST /auth/register` or `POST /auth/login`
2. Response body contains `data.accessToken`
3. Refresh token is not exposed to JavaScript; it is set as an `HttpOnly` cookie
4. Send access token with `Authorization: Bearer <token>`
5. For `/auth/refresh` and `/auth/logout`, frontend must send cookies (`credentials: 'include'` / axios `withCredentials: true`)
6. On a 401 caused by an expired access token, call `/auth/refresh` once, replace in-memory access token, then retry the original request
7. Do not store the access token in `localStorage` in the planned frontend; keep it in memory and recover via refresh after page reload

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
