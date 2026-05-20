# TillMate API (Express + MongoDB)

Central service for **mobile batch sync**, **backup**, and **admin read APIs**.

## Deploy on Render

This folder is a **standalone Node API**. The Expo app lives in the repo root — do not use the root `package.json` start command on Render.

| Setting | Value |
|---------|--------|
| **Root Directory** | `backend` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` (runs `node src/server.js`) |

Do **not** use `node .`, `node expo-router/entry`, or `expo start` — those come from the mobile app and cause:

`Cannot find module '.../backend/expo-router/entry'`

**Environment variables** (required): `MONGODB_URI`, `JWT_SECRET`. Optional: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PORT` (Render sets `PORT` automatically).

You can also deploy via the repo root [`render.yaml`](../render.yaml) blueprint.

## Setup

```bash
cd backend
cp .env.example .env
# Edit .env — set MONGODB_URI and JWT_SECRET (and ADMIN_* for dashboard login)
npm install
npm run dev
```

- Health: `GET http://localhost:4000/health`

On startup, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, an **admin** user is upserted and a **dev JWT** is printed once (rotate secrets in production; do not log tokens in prod).

## Auth

### Register (mobile / first-time cloud user)

`POST /api/auth/register`

```json
{
  "phone": "+263712345678",
  "email": "shop@example.com",
  "password": "secret",
  "fullName": "Jane Doe",
  "streetAddress": "12 George Ave",
  "city": "Chegutu",
  "shopName": "Beauty Table",
  "shopNumber": "Shop 2",
  "clientUserId": 1
}
```

Response: `{ "token": "...", "user": { ... } }` — use `Authorization: Bearer <token>` on sync routes.

### Login

`POST /api/auth/login`

```json
{ "phone": "+263712345678", "password": "secret" }
```

or `{ "email": "shop@example.com", "password": "secret" }`

Admin logs in with the seeded **admin email + password** from `.env`.

## Batch sync (mobile)

`POST /api/sync/batch`  
Header: `Authorization: Bearer <token>`

Body:

```json
{
  "operations": [
    {
      "type": "user.register",
      "payload": {
        "clientUserId": 1,
        "fullName": "Jane Doe",
        "streetAddress": "12 George Ave",
        "city": "Chegutu",
        "shopName": "Beauty Table",
        "shopNumber": "Shop 2",
        "phone": "+263712345678",
        "email": "shop@example.com"
      }
    },
    {
      "type": "product.upsert",
      "payload": {
        "clientProductId": 10,
        "name": "Soap",
        "price": 1.5,
        "stock": 40,
        "category": "General",
        "costPrice": 0.9,
        "deletedAt": null,
        "clientUpdatedAt": "2026-04-19 12:00:00"
      }
    },
    {
      "type": "sale.upsert",
      "payload": {
        "clientSaleId": 100,
        "total": 12.5,
        "saleDate": "2026-04-19",
        "paidAmount": 15,
        "changeAmount": 2.5,
        "paymentMethod": "Cash",
        "clientCreatedAt": "2026-04-19 12:05:00",
        "items": [
          {
            "clientItemIndex": 0,
            "productId": 10,
            "productName": "Soap",
            "quantity": 2,
            "unitPrice": 1.5
          }
        ]
      }
    }
  ]
}
```

Response: `{ "accepted", "failed", "results": [{ "index", "ok", ... }] }`

### Operation types

| `type`           | Purpose |
|------------------|---------|
| `user.register`  | Patch profile + `clientUserId` on the JWT user (optional metadata sync). |
| `product.upsert` | Upsert by `(userId, clientProductId)` — `clientProductId` = SQLite `products.id`. |
| `sale.upsert`    | Upsert sale by `(userId, clientSaleId)`; **replaces** all `sale_items` for that sale. |

Max **500** operations per request (tune as needed).

## Admin dashboard APIs

All require `Authorization: Bearer <admin_jwt>` (user with `role: 'admin'`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/summary` | Counts: users, products, sales |
| GET | `/api/admin/users?page=1&limit=25` | Paginated tenant list |
| GET | `/api/admin/users/:userId` | One user (no password hash) |
| GET | `/api/admin/users/:userId/products?page=1&limit=50` | Products for tenant |
| GET | `/api/admin/users/:userId/sales?page=1&limit=50` | Sales for tenant |
| GET | `/api/admin/users/:userId/sales/:clientSaleId/items` | Line items for one sale |

## Collections (Mongoose)

- **users** — tenants + optional `admin` role  
- **products** — `userId` + `clientProductId` (SQLite id)  
- **sales** — `userId` + `clientSaleId` (SQLite id)  
- **sale_items** — `saleId` + `clientItemIndex`; linked to parent sale  

## Notes

- **Idempotency**: upserts use stable client ids from the device.
- **Transactions**: batch steps are sequential; for strong atomicity across related writes, use MongoDB replica set + sessions in a later iteration.
- **Security**: use HTTPS in production, rotate `JWT_SECRET`, never log tokens, rate-limit `/api/auth/login` and `/api/sync/batch`.
