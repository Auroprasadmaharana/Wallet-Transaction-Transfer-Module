import { prisma } from '../src/config/database';

beforeAll(async () => {
  // Ensure database is ready
  await prisma.$connect();
});

beforeEach(async () => {
  // Clean tables before each test suite execution
  await prisma.transaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
