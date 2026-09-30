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
  username: string | null;
  bio: string;
  academicYear: number | null;
  avatarUrl: string | null;
  coverUrl: string | null;
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
  user: { _id: string; name: string; username: string | null; avatarUrl: string | null; university: string; faculty?: string; department?: string };
  author: Post['user']; // alias of user
  coverImage: string | null;
  tags: string[];
  images: string[];
  attachments: PostAttachment[];
  feeling: string | null;
  taggedFriends: string[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PostAttachment {
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface PostComment {
  _id: string;
  post: string;
  author: Post['user'];
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfile {
  id: string;
  name: string;
  username: string | null;
  bio: string;
  academicYear: number | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  university: 'KMITL' | 'KMUTNB' | 'KMUTT';
  faculty?: string;
  department?: string;
  friendCount: number;
  mutualFriendCount: number;
  relationshipStatus: 'self' | 'none' | 'friends' | 'pending_sent' | 'pending_received';
  requestId: string | null;
}

export type PublicFriend = Pick<PublicProfile, 'id' | 'name' | 'username' | 'avatarUrl' | 'university' | 'faculty' | 'department'>;
```

## Profiles

- `PATCH /users/me/profile` — authenticated partial update. Accepts `{ name?, username?, bio?, faculty?, department?, academicYear?, avatarUrl?, coverUrl? }`; at least one field is required. `name` is 2–80 characters, `username` is 3–30 ASCII letters/digits/underscores/dots with a letter/digit/underscore at both ends, and is stored lowercase. `username: null` clears it; `409 USERNAME_TAKEN` means another user owns it. `bio` is at most 500 characters; `""` clears it. `faculty` and `department` are nonblank, at most 150 characters. `academicYear` is an integer 1–8 or `null`. `avatarUrl` and `coverUrl` accept only `null` to clear; upload images to set them. Returns `{ user }` with the same shape as `/auth/me`. `university` is read-only and derived from the verified Google email.
- `POST /users/me/avatar` and `POST /users/me/cover` — authenticated multipart upload with one field named `file`. The upload immediately saves the image to the profile and returns `{ user, asset: { url, mimeType, size } }`. JPEG, PNG, GIF, WebP and AVIF are accepted after signature validation. Avatar limit is 5 MiB; cover limit is 10 MiB. Both share a limit of 20 uploads per IP per 15 minutes. Images are served at the public `asset.url` under `/api/v1/users/uploads/`. Resolve this path against the API origin.
- `DELETE /users/me/avatar` and `DELETE /users/me/cover` — authenticated clear operation returning `{ user }`. The upload, update and clear calls save independently, so a later failed call does not undo an earlier successful one. Old image URLs remain accessible to someone who retained them after replacement or clearing; unused files are not yet cleaned up automatically.
- `GET /users/:userId/profile` — public active-user profile in `{ profile: PublicProfile }`. The ID is the user's MongoDB ObjectId. Only safe fields are exposed; email, Google identity, role and private account fields are excluded. `friendCount` counts accepted active friends. With an optional bearer token, `mutualFriendCount`, `relationshipStatus`, and `requestId` reflect the viewer; guests get `0`, `none`, and `null`. Viewing your own profile gives `self` and `0` mutual friends.
- `GET /users/:userId/posts?page=1&limit=20&search=...&tag=...` — published posts by this active user only, in `{ items, page, limit, total, pages }`. Posts use the same enriched shape as `GET /posts`; an optional bearer token populates `likedByMe` and `savedByMe`. Drafts never appear, including on the owner's public profile. Add `imagesOnly=1` for the photo tab; it includes posts with an image, cover image, or image attachment and supports normal pagination and search. Use `GET /posts/mine` to manage your own drafts.
- `GET /users/:userId/friends?page=1&limit=20` — accepted active friends, sorted by name, in `{ items: PublicFriend[], page, limit, total, pages }`. This public list exposes only safe friend summaries, with no friendship or presence metadata.

All three routes return `404 USER_NOT_FOUND` for missing or inactive users and `422 VALIDATION_ERROR` for invalid IDs. Paginated routes also reject invalid pagination. Page and limit default to `1` and `20`; limit is capped at `100`.

## Friends and connections

- `GET /friends` — your accepted active friends in a plain array of `PublicFriend & { friendshipId, isOnline, mutualFriendCount }`. `isOnline` is a socket-presence snapshot.
- `GET /friends/requests` — `{ incoming, outgoing }` pending arrays; each item is `{ id, requester: PublicFriend, recipient: PublicFriend, createdAt }`.
- `GET /friends/suggestions?limit=20` — active users who are neither accepted friends nor part of a pending request. Returns a plain array of `PublicFriend & { relationshipStatus: 'none', requestId: null, mutualFriendCount }`, ranked by mutual friends and filled alphabetically. Limit is 1–50.
- `GET /friends/search?q=...&university=...` and `GET /friends/users/:userId` — public users with `relationshipStatus`, `requestId`, and `mutualFriendCount`. Search returns at most 50 users.
- `POST /friends/request` with `{ targetUserId }`, `POST /friends/respond` with `{ requestId, action: 'accept' | 'reject' }`, and `DELETE /friends/requests/:requestId` to cancel your own outgoing pending request. Accepted friends can open a direct chat with `POST /chats/direct` using `{ userId }`.

These routes require a bearer token and a complete profile. Mutual counts include only active accepted friends shared with the current viewer. See [chat.md](chat.md) for Socket.IO updates and response details.

## Posts

- `GET /posts?page=1&limit=20&search=...` — public published list; send an optional bearer token for `likedByMe` and `savedByMe`
- `GET /posts/mine?page=1&limit=20&search=...` — current user's drafts + published posts
- `GET /posts/bookmarks?page=1&limit=20&search=...` — current user's saved published posts
- `GET /posts/:id` — published post; authenticated owner/admin can also read a draft
- `POST /posts` — authenticated; accepts `{ title?, content?, status?, coverImage?, tags?, images?, attachments?, feeling?, taggedFriends? }`. Text or media is required. Title is derived from text/media when omitted. Status defaults to `published`; set `draft` for private drafts. `taggedFriends` must contain active accepted friend IDs.
- `PATCH /posts/:id` — owner/admin
- `DELETE /posts/:id` — owner/admin
- `PUT /posts/:id/like` / `DELETE /posts/:id/like` — idempotent like/unlike; returns `{ post }`
- `PUT /posts/:id/bookmark` / `DELETE /posts/:id/bookmark` — idempotent save/unsave; returns `{ post }`
- `GET /posts/:id/comments?page=1&limit=20` — flat oldest-first comments
- `POST /posts/:id/comments` — `{ content, parentId? }`; returns `{ comment }`. Replies to a reply are attached to its root comment.
- `DELETE /posts/:id/comments/:commentId` — comment author, post author, or admin
- `POST /posts/uploads` — one multipart field named `file`; returns `{ asset: { url, name, mimeType, size } }`. Images (JPEG, PNG, GIF, WebP, AVIF), PDF, TXT, DOC and DOCX are accepted up to 10 MiB; 30 uploads per IP per 15 minutes.
- `GET /posts/uploads/:filename` — public uploaded file. `asset.url` starts with `/api/v1/`, so resolve it against the API origin.

List endpoints return `{ items, page, limit, total, pages }` inside the success envelope. Post detail/create/update/like/bookmark return `{ post }`; create returns HTTP 201. `likeCount`/`commentCount` are also exposed as `likesCount`/`commentsCount` aliases.

Uploaded file URLs are public and remain accessible to someone who retained the URL even if a post becomes a draft or is deleted. Files uploaded but never attached to a post are not yet cleaned up automatically; keep persistent `UPLOAD_DIR` storage and plan periodic orphan cleanup. Run `npm run db:indexes` during production deployment to create unique like/bookmark indexes.
