# King Mongkut Social API

Backend สำหรับ King Mongkut Social Posts + Authentication ด้วย **Node.js, TypeScript, Express 5, Mongoose 9** ออกแบบให้ frontend Vite/TypeScript ต่อได้ง่าย

## Features

- TypeScript strict mode + ESM
- Express 5 + Mongoose
- Register / Login / Me / Refresh / Logout
- Short-lived access token ผ่าน `Authorization: Bearer ...`
- Refresh token ผ่าน `HttpOnly` cookie + token rotation + server-side revocation
- Password hashing ด้วย bcrypt
- CRUD Posts พร้อม ownership (`user`) และ override (`admin`)
- Public published posts + private drafts ของเจ้าของ
- Zod validation
- Helmet, CORS allowlist, rate limiting, compression
- Pino structured logging + sensitive-field redaction
- Centralized errors + consistent JSON response
- Pagination + search
- MongoDB indexes + TTL index สำหรับ refresh sessions
- Health check, graceful shutdown
- Vitest/Supertest starter test
- Dockerfile + Docker Compose
- OpenAPI starter spec + frontend integration contract

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

MongoDB ต้องทำงานตาม `MONGODB_URI` หรือใช้:

```bash
docker compose up mongo -d
npm run dev
```

API: `http://localhost:4000/api/v1`
Liveness: `http://localhost:4000/health`  
Readiness: `http://localhost:4000/ready`

## Environment

ตั้ง secret ให้เป็น random string อย่างน้อย 32 ตัวอักษร และ **ต้องใช้คนละค่า**:

```env
ACCESS_TOKEN_SECRET=...
REFRESH_TOKEN_SECRET=...
```

Production ควรใช้:

```env
NODE_ENV=production
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
CORS_ORIGINS=https://your-frontend.example.com
TRUST_PROXY=1
```

> หาก frontend/backend อยู่ same-site สามารถใช้ `COOKIE_SAME_SITE=lax` ได้ ซึ่งปลอดภัยกว่า `none` เมื่อ deployment architecture รองรับ

## Main endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | No | Register |
| POST | `/api/v1/auth/login` | No | Login |
| POST | `/api/v1/auth/refresh` | Refresh cookie | Rotate token |
| POST | `/api/v1/auth/logout` | Refresh cookie | Revoke session |
| GET | `/api/v1/auth/me` | Bearer | Current user |
| GET | `/api/v1/posts` | No | Published posts |
| GET | `/api/v1/posts/mine` | Bearer | Own posts |
| GET | `/api/v1/posts/:id` | Optional | Published, or own private post |
| POST | `/api/v1/posts` | Bearer | Create |
| PATCH | `/api/v1/posts/:id` | Bearer | Update own/admin |
| DELETE | `/api/v1/posts/:id` | Bearer | Delete own/admin |

### Register example

```bash
curl -i http://localhost:4000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"name":"Demo User","email":"demo@example.com","password":"StrongPass123"}'
```

Response body จะคืน `accessToken`; refresh token จะอยู่ใน `HttpOnly` cookie

### Authenticated request

```bash
curl http://localhost:4000/api/v1/posts/mine \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Refresh

Frontend ต้องส่ง cookie ด้วย (`credentials: 'include'` ใน fetch / `withCredentials: true` ใน axios)

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/refresh \
  --cookie 'refresh_token=...'
```

## Response shape

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed"
  }
}
```

## Commands

```bash
npm run dev
npm run typecheck
npm run build
npm run db:indexes
npm run lint
npm test
npm run build
npm start
```

## Production notes

- ใช้ HTTPS เสมอ
- เก็บ secrets ใน secret manager ของ platform ห้าม commit `.env`
- เปิด `COOKIE_SECURE=true`
- กำหนด `CORS_ORIGINS` แบบ allowlist ไม่ใช้ wildcard เมื่อส่ง credentials
- ตั้ง `TRUST_PROXY` ให้ตรงกับ reverse proxy / load balancer
- ใน production `autoIndex` ถูกปิด; หลัง `npm run build` ให้รัน `npm run db:indexes` ใน deployment step เมื่อ schema/index เปลี่ยน
- rate limit ในตัวอย่างเป็น in-memory; หาก scale หลาย instance ให้เปลี่ยนเป็น shared store เช่น Redis
- ถ้าต้องการ force logout ทุก device ให้ revoke sessions ของ user ทั้งหมด

## Structure

```text
src/
  config/
  common/
    errors/
    middleware/
    types/
    utils/
  modules/
    auth/
    posts/
    users/
  routes/
  app.ts
  server.ts
```
