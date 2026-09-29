"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../../src/app");
const app = (0, app_1.createApp)();
describe('Transfer Concurrency & Race Condition Integrity Tests', () => {
    let tokenAlice;
    let walletIdAlice;
    let tokenBob;
    let walletIdBob;
    let tokenCharlie;
    let walletIdCharlie;
    beforeEach(async () => {
        // 1. Create Alice
        const resAlice = await (0, supertest_1.default)(app)
            .post('/api/v1/auth/register')
            .send({ name: 'Alice Concurrency', email: 'alice.conc@example.com', password: 'Password123!' });
        tokenAlice = resAlice.body.data.token;
        // 2. Create Bob
        const resBob = await (0, supertest_1.default)(app)
            .post('/api/v1/auth/register')
            .send({ name: 'Bob Concurrency', email: 'bob.conc@example.com', password: 'Password123!' });
        tokenBob = resBob.body.data.token;
        // 3. Create Charlie
        const resCharlie = await (0, supertest_1.default)(app)
            .post('/api/v1/auth/register')
            .send({ name: 'Charlie Concurrency', email: 'charlie.conc@example.com', password: 'Password123!' });
        tokenCharlie = resCharlie.body.data.token;
        // 4. Create Wallets
        const resWalletA = await (0, supertest_1.default)(app)
            .post('/api/v1/wallets')
            .set('Authorization', `Bearer ${tokenAlice}`)
            .send({ currency: 'USD', initialBalance: 1000 });
        walletIdAlice = resWalletA.body.data.id;
        const resWalletB = await (0, supertest_1.default)(app)
            .post('/api/v1/wallets')
            .set('Authorization', `Bearer ${tokenBob}`)
            .send({ currency: 'USD', initialBalance: 0 });
        walletIdBob = resWalletB.body.data.id;
        const resWalletC = await (0, supertest_1.default)(app)
            .post('/api/v1/wallets')
            .set('Authorization', `Bearer ${tokenCharlie}`)
            .send({ currency: 'USD', initialBalance: 0 });
        walletIdCharlie = resWalletC.body.data.id;
    });
    it('should handle 10 concurrent transfers accurately without race conditions', async () => {
        // 10 concurrent transfers of $100 from Alice to Bob
        const transferPromises = Array.from({ length: 10 }, (_, i) => (0, supertest_1.default)(app)
            .post(`/api/v1/wallets/${walletIdAlice}/transfer`)
            .set('Authorization', `Bearer ${tokenAlice}`)
            .send({
            receiverWalletId: walletIdBob,
            amount: 100,
            description: `Concurrent batch transfer #${i + 1}`,
        }));
        const responses = await Promise.all(transferPromises);
        // All 10 requests must succeed
        responses.forEach((res) => {
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
        // Check Alice's final balance
        const finalAlice = await (0, supertest_1.default)(app)
            .get(`/api/v1/wallets/${walletIdAlice}`)
            .set('Authorization', `Bearer ${tokenAlice}`);
        expect(finalAlice.body.data.balance).toBe(0);
        // Check Bob's final balance
        const finalBob = await (0, supertest_1.default)(app)
            .get(`/api/v1/wallets/${walletIdBob}`)
            .set('Authorization', `Bearer ${tokenBob}`);
        expect(finalBob.body.data.balance).toBe(1000);
    });
    it('should prevent double spending when multiple concurrent transfers exceed available balance', async () => {
        // Alice has $100 balance. 5 concurrent requests of $50 each are dispatched.
        // Exactly 2 must succeed ($100 spent), 3 must be rejected with 422 INSUFFICIENT_FUNDS.
        await (0, supertest_1.default)(app)
            .post(`/api/v1/wallets/${walletIdAlice}/add-money`)
            .set('Authorization', `Bearer ${tokenAlice}`)
            .send({ amount: 0 }); // Just ensuring state
        // Set Alice balance to exactly 100 by draining 900
        await (0, supertest_1.default)(app)
            .post(`/api/v1/wallets/${walletIdAlice}/transfer`)
            .set('Authorization', `Bearer ${tokenAlice}`)
            .send({ receiverWalletId: walletIdBob, amount: 900 });
        const concurrentRequests = Array.from({ length: 5 }, (_, i) => (0, supertest_1.default)(app)
            .post(`/api/v1/wallets/${walletIdAlice}/transfer`)
            .set('Authorization', `Bearer ${tokenAlice}`)
            .send({
            receiverWalletId: walletIdCharlie,
            amount: 50,
            description: `Race condition test #${i + 1}`,
        }));
        const results = await Promise.all(concurrentRequests);
        const successful = results.filter((r) => r.status === 200);
        const failed = results.filter((r) => r.status === 422);
        expect(successful.length).toBe(2);
        expect(failed.length).toBe(3);
        // Verify Alice's final balance is exactly 0 and NEVER negative
        const finalAlice = await (0, supertest_1.default)(app)
            .get(`/api/v1/wallets/${walletIdAlice}`)
            .set('Authorization', `Bearer ${tokenAlice}`);
        expect(finalAlice.body.data.balance).toBe(0);
        expect(finalAlice.body.data.balance).toBeGreaterThanOrEqual(0);
        // Verify Charlie received exactly $100
        const finalCharlie = await (0, supertest_1.default)(app)
            .get(`/api/v1/wallets/${walletIdCharlie}`)
            .set('Authorization', `Bearer ${tokenCharlie}`);
        expect(finalCharlie.body.data.balance).toBe(100);
    });
    it('should prevent deadlocks during simultaneous cross-transfers (A -> B and B -> A)', async () => {
        // Fund Bob with $500
        await (0, supertest_1.default)(app)
            .post(`/api/v1/wallets/${walletIdBob}/add-money`)
            .set('Authorization', `Bearer ${tokenBob}`)
            .send({ amount: 500 });
        // Alice transfers $50 to Bob while Bob simultaneously transfers $50 to Alice
        const [resAB, resBA] = await Promise.all([
            (0, supertest_1.default)(app)
                .post(`/api/v1/wallets/${walletIdAlice}/transfer`)
                .set('Authorization', `Bearer ${tokenAlice}`)
                .send({ receiverWalletId: walletIdBob, amount: 50, description: 'Alice to Bob' }),
            (0, supertest_1.default)(app)
                .post(`/api/v1/wallets/${walletIdBob}/transfer`)
                .set('Authorization', `Bearer ${tokenBob}`)
                .send({ receiverWalletId: walletIdAlice, amount: 50, description: 'Bob to Alice' }),
        ]);
        expect(resAB.status).toBe(200);
        expect(resBA.status).toBe(200);
    });
});
