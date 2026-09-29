import request from 'supertest';
import { createApp } from '../../src/app';

const app = createApp();

describe('Wallet End-to-End API Tests', () => {
  let tokenAlice: string;
  let userIdAlice: string;
  let walletIdAlice: string;

  let tokenBob: string;
  let userIdBob: string;
  let walletIdBob: string;

  beforeEach(async () => {
    // 1. Register Alice
    const resAlice = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Alice Smith',
        email: 'alice@example.com',
        password: 'Password123!',
      })
      .expect(201);

    tokenAlice = resAlice.body.data.token;
    userIdAlice = resAlice.body.data.user.id;

    // 2. Register Bob
    const resBob = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Bob Johnson',
        email: 'bob@example.com',
        password: 'Password123!',
      })
      .expect(201);

    tokenBob = resBob.body.data.token;
    userIdBob = resBob.body.data.user.id;

    // 3. Create Wallets
    const resWalletA = await request(app)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${tokenAlice}`)
      .send({ currency: 'USD', initialBalance: 1000 })
      .expect(201);

    walletIdAlice = resWalletA.body.data.id;

    const resWalletB = await request(app)
      .post('/api/v1/wallets')
      .set('Authorization', `Bearer ${tokenBob}`)
      .send({ currency: 'USD', initialBalance: 200 })
      .expect(201);

    walletIdBob = resWalletB.body.data.id;
  });

  describe('Wallet Creation API', () => {
    it('should create a wallet with status 201', async () => {
      expect(walletIdAlice).toBeDefined();
      expect(walletIdBob).toBeDefined();
    });

    it('should return 409 Conflict if creating a second active USD wallet for the same user', async () => {
      const res = await request(app)
        .post('/api/v1/wallets')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ currency: 'USD', initialBalance: 500 })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('Add Money API', () => {
    it('should add money and update wallet balance', async () => {
      const res = await request(app)
        .post(`/api/v1/wallets/${walletIdAlice}/add-money`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ amount: 500, description: 'Freelance Payout' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.wallet.balance).toBe(1500);
      expect(res.body.data.transaction.type).toBe('CREDIT');
    });

    it('should reject non-positive amounts with 422 Unprocessable', async () => {
      const res = await request(app)
        .post(`/api/v1/wallets/${walletIdAlice}/add-money`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ amount: -50 })
        .expect(422);

      expect(res.body.success).toBe(false);
    });

    it('should handle Idempotency-Key preventing duplicate money additions', async () => {
      const idempotencyKey = 'idem-add-12345';

      // First Request
      const firstRes = await request(app)
        .post(`/api/v1/wallets/${walletIdAlice}/add-money`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: 100, description: 'Idempotent Add' })
        .expect(200);

      expect(firstRes.body.data.wallet.balance).toBe(1100);

      // Duplicate Request with identical key
      const duplicateRes = await request(app)
        .post(`/api/v1/wallets/${walletIdAlice}/add-money`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: 100, description: 'Idempotent Add' })
        .expect(200);

      expect(duplicateRes.headers['x-cache-lookup']).toMatch(/HIT-IDEMPOTENT/);

      // Verify wallet balance is STILL 1100 (not 1200!)
      const walletRes = await request(app)
        .get(`/api/v1/wallets/${walletIdAlice}`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(walletRes.body.data.balance).toBe(1100);
    });
  });

  describe('Transfer Money API', () => {
    it('should atomically transfer money between Alice and Bob', async () => {
      const res = await request(app)
        .post(`/api/v1/wallets/${walletIdAlice}/transfer`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          receiverWalletId: walletIdBob,
          amount: 400,
          description: 'Payment for services',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.senderBalanceAfter).toBe(600);
      expect(res.body.data.receiverBalanceAfter).toBe(600);
      expect(res.body.data.referenceId).toBeDefined();

      // Verify Alice summary
      const aliceSummary = await request(app)
        .get(`/api/v1/wallets/${walletIdAlice}/summary`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(aliceSummary.body.data.currentBalance).toBe(600);
      expect(aliceSummary.body.data.totalDebited).toBe(400);

      // Verify Bob summary
      const bobSummary = await request(app)
        .get(`/api/v1/wallets/${walletIdBob}/summary`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .expect(200);

      expect(bobSummary.body.data.currentBalance).toBe(600);
      expect(bobSummary.body.data.totalCredited).toBe(600); // 200 initial + 400 transfer
    });

    it('should return 422 Insufficient Funds when transfer exceeds balance', async () => {
      const res = await request(app)
        .post(`/api/v1/wallets/${walletIdAlice}/transfer`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          receiverWalletId: walletIdBob,
          amount: 5000,
        })
        .expect(422);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('Transaction History & Pagination API', () => {
    it('should paginate and filter transactions correctly', async () => {
      // Create 3 operations for Alice
      await request(app)
        .post(`/api/v1/wallets/${walletIdAlice}/add-money`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ amount: 100 });

      await request(app)
        .post(`/api/v1/wallets/${walletIdAlice}/transfer`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ receiverWalletId: walletIdBob, amount: 50 });

      await request(app)
        .post(`/api/v1/wallets/${walletIdAlice}/transfer`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ receiverWalletId: walletIdBob, amount: 75 });

      // Query page 1 with limit 2
      const page1Res = await request(app)
        .get(`/api/v1/transactions/wallet/${walletIdAlice}?page=1&limit=2`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(page1Res.body.data).toHaveLength(2);
      expect(page1Res.body.meta.totalItems).toBe(4); // 1 initial + 1 add + 2 transfers
      expect(page1Res.body.meta.totalPages).toBe(2);
      expect(page1Res.body.meta.hasNextPage).toBe(true);

      // Query with type filter 'DEBIT'
      const debitRes = await request(app)
        .get(`/api/v1/transactions/wallet/${walletIdAlice}?type=DEBIT`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .expect(200);

      expect(debitRes.body.data).toHaveLength(2);
      debitRes.body.data.forEach((tx: { type: string }) => {
        expect(tx.type).toBe('DEBIT');
      });
    });
  });
});
