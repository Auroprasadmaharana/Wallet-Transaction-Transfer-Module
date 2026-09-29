"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../src/config/database");
beforeAll(async () => {
    // Ensure database is ready
    await database_1.prisma.$connect();
});
beforeEach(async () => {
    // Clean tables before each test suite execution
    await database_1.prisma.transaction.deleteMany();
    await database_1.prisma.wallet.deleteMany();
    await database_1.prisma.user.deleteMany();
    await database_1.prisma.idempotencyRecord.deleteMany();
});
afterAll(async () => {
    await database_1.prisma.$disconnect();
});
