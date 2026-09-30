# Google sign-in for the three universities

The app accepts only verified Google Workspace accounts whose **email** ends in exactly one of:

| Email domain | University |
| --- | --- |
| `kmitl.ac.th` | KMITL |
| `mail.kmutt.ac.th` | KMUTT |
| `email.kmutnb.ac.th` | KMUTNB |

Personal Gmail, other university domains, and additional subdomains are rejected by the API. The signed `hd` claim must also belong to the same university's Workspace domain family. The account selector can show other accounts; selecting one does not grant access.

## Google Cloud setup

1. Create or select a Google Cloud project and configure Google Auth Platform branding/consent information.
2. Set the audience to **External** so students from all three organizations can use the app. During Testing, add the actual university accounts as test users. Publish the consent configuration for wider use when ready.
3. Create an OAuth client with application type **Web application**.
4. Add this authorized redirect URI for development, exactly:
   `http://localhost:4000/api/v1/auth/google/callback`
5. Put the client ID and secret in the API's untracked `.env`:

   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:4000/api/v1/auth/google/callback
   FRONTEND_URL=http://localhost:5173
   CORS_ORIGINS=http://localhost:5173
   COOKIE_SECURE=false
   COOKIE_SAME_SITE=lax
   ```

6. Start MongoDB and the API, then start the frontend. Open `http://localhost:5173/login` and choose a university account.

Only `openid email profile` scopes are requested. Gmail inbox access and Google offline access are not requested. This server redirect flow does not use a browser Google SDK or a client secret in `VITE_*` variables.

Reference: [Google OpenID Connect server flow](https://developers.google.com/identity/openid-connect/openid-connect) and [server-side ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Production and rollout

- Configure `FRONTEND_URL` as the frontend origin, `GOOGLE_REDIRECT_URI` as the public HTTPS API callback URL, `CORS_ORIGINS` to include the frontend, and `COOKIE_SECURE=true`. Register the exact callback with Google. HTTPS and secure cookies are enforced in production.
- The API now forces the refresh cookie to `SameSite=None` in production so credentialed frontend requests can restore the session after the Google redirect even when the frontend and API use different origins/sites. The short-lived Google OAuth binding cookie remains `SameSite=Lax` because it is only needed on the top-level callback navigation.
- In development/test, `COOKIE_SAME_SITE` is still honored so localhost can keep using `lax` without requiring HTTPS.
- If serving the frontend on port 8080 through Docker, update both `FRONTEND_URL` and `CORS_ORIGINS` accordingly. Keep `VITE_API_BASE_URL` pointed at the public API URL.
- Deploy API and frontend together. Run `npm run build` and `npm run db:indexes` in the API deployment before accepting logins. Production disables automatic index creation. The new partial unique Google subject index and OAuth transaction TTL index must exist.
- Existing user documents and password hashes are preserved. No database reset or bulk user migration is needed. Legacy JWTs without `authVersion: 2` are rejected immediately; users must sign in with Google. Old session documents expire through their existing TTL index.
- A verified email links to an unlinked legacy account while preserving its ID, name, role, posts and relationships. A conflicting Google subject is rejected. Accounts with unsupported email addresses retain their data but cannot sign in through this flow.
- Users without both faculty and department must complete `/complete-profile`, including legacy users. Browser-only `mock_profile_*` entries are not imported or treated as saved profile data.
- OAuth transactions expire after 10 minutes and are consumed atomically. Starting another login in the same browser replaces the flow cookie; an older tab must restart sign-in.
- `GET /auth/google` fails closed and redirects to a Thai error screen when credentials are missing. Workspace administrators may need to permit the application if their organization blocks third-party apps.

## Verification

Run from the API folder:

```bash
npm run check
npm run build
```

Auth integration tests use a disposable MongoDB instance via `mongodb-memory-server`, locally signed Google-shaped tokens, and mocked Google HTTPS responses. The first test run downloads a MongoDB test binary and needs network access; subsequent runs can use its cache. Tests never use the application's MongoDB database or real Google credentials.

Run `npm run check` and `npm run build` in the frontend folder. Its DOM tests cover Google entry pages, callback routing, profile validation/persistence, retry, session restoration, and route guards.

With real credentials, manually verify one account from each university, cancellation, personal Gmail rejection, first-time profile completion, refresh, logout and returning from a protected page. Check only sanitized auth failure codes in logs; OAuth query parameters, cookies and redirect headers are not logged.
