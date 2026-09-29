Wallet Transfer Project

This is a small backend project I built for wallets and sending money between users. It uses Node.js, Express, TypeScript and Prisma.

What it does
Wallets: A user can create a wallet (default currency is USD). Each user can have only one active wallet per currency. A wallet can be ACTIVE, INACTIVE or FROZEN.
Add money: You can put money into an active wallet. The amount must be more than 0 and can have at most 2 decimal places. Each deposit is saved as a CREDIT/DEPOSIT transaction.
Transfer money: You can send money from one user to another. Before sending, it checks that:
both wallets exist and are ACTIVE
the amount is valid
the sender has enough balance
the sender and receiver are different people
both wallets use the same currency
If everything is fine, the sender's balance goes down, the receiver's goes up, and both sides get a transaction record (DEBIT and CREDIT) linked by one reference ID.
Transaction history: You can see a wallet's transactions with pages (page, limit). You can filter by type, category, status and dates, and sort by date or amount.
Wallet summary: Shows the current balance, total credited, total debited, net flow and number of transactions.
Safety stuff:
No deadlocks: wallets are always locked in the same order (sorted by ID).
No double spending: balance checks and updates happen in one serializable transaction.
Idempotency: send an optional Idempotency-Key header on /add-money and /transfer so a retry doesn't repeat the payment.
Login with JWT and bcrypt passwords.
Swagger docs at /api-docs.
Tech used

Node.js 20+, TypeScript, Express, Prisma, SQLite (local) or PostgreSQL (production/Docker), Zod for validation, Jest and Supertest for tests, JWT and bcryptjs for auth, Swagger for docs.

Folder layout
src/
  app.ts           - express setup
  server.ts        - starts the server
  config/          - env, database, logger, redis
  middlewares/     - auth, validation, idempotency, errors, logging
  modules/         - auth, wallet, transaction
  docs/swagger.ts  - api docs
  prisma/          - schema and seed
  public/          - test dashboard and postman collection
How to run it

You need Node 20 or newer, npm 10 or newer, and Git.

1. Clone and install

bash
git clone <repository-url>
cd "Wallet Transaction & Transfer Module"
npm install

2. Set up the env file

bash
# Linux / macOS / Git Bash
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env

The default .env:

env
PORT=3000
NODE_ENV=development
DATABASE_URL="file:./dev.db?connection_limit=1&timeout=20000"
JWT_SECRET=super_secret_jwt_key_wallet_production_2026_change_in_prod
JWT_EXPIRES_IN=24h
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=false
LOG_LEVEL=info

(Change the JWT secret before using this in production!)

3. Set up the database and add demo data

bash
npm run prisma:generate
npm run prisma:push
npm run seed

Demo users (all use the password Password123!):

Alice, $1,500.00, alice@example.com
Bob, $500.00, bob@example.com
Charlie, $200.00, charlie@example.com

4. Start the server

bash
npm run dev

It runs at http://localhost:3000.

5. Open these

Dashboard: http://localhost:3000 (test deposits and transfers)
Swagger docs: http://localhost:3000/api-docs
Health check: http://localhost:3000/health
Running with Docker
bash
docker compose up --build -d   # start
docker compose ps              # check status
docker compose logs -f         # see logs
docker compose down            # stop
Tests
bash
npm test                  # everything
npm run test:unit         # unit tests
npm run test:integration  # integration tests
npm run test:coverage     # coverage report
API list

Auth

POST /api/v1/auth/register - sign up
POST /api/v1/auth/login - log in
GET /api/v1/auth/me - my profile (needs Bearer token)

Wallets

POST /api/v1/wallets - create wallet
POST /api/v1/wallets/:walletId/add-money - deposit
POST /api/v1/wallets/:walletId/transfer - transfer
GET /api/v1/wallets/:walletId - get one wallet
GET /api/v1/wallets/user/:userId - get a user's wallets
GET /api/v1/wallets/:walletId/summary - wallet summary
PATCH /api/v1/wallets/:walletId/status - change status (ACTIVE / FROZEN / INACTIVE)

Transactions

GET /api/v1/transactions/wallet/:walletId - list transactions. Query options: page, limit, type, category, fromDate, toDate, sortBy, sortOrder
GET /api/v1/transactions/:transactionId - one transaction
How I avoided deadlocks and double spending

Deadlocks: Say two transfers happen at the same time, A to B and B to A. If each one locks its sender first, they can get stuck waiting for each other. To fix that, I sort the two wallet IDs and always lock in that order:

typescript
const [firstId, secondId] = [senderWalletId, receiverWalletId].sort();

Double spending: The balance check and the update happen inside one database transaction. If many requests come in together and the balance can't cover all of them, only the ones that fit will go through. The rest fail with 422 INSUFFICIENT_FUNDS.

License

MIT