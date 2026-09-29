import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { walletRepository } from '../modules/wallet/wallet.repository';

async function seed() {
  console.log('Seeding database...');

  await prisma.transaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
  await prisma.idempotencyRecord.deleteMany();

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const alice = await prisma.user.create({
    data: {
      name: 'Alice Smith',
      email: 'alice@example.com',
      password: passwordHash,
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: 'Bob Johnson',
      email: 'bob@example.com',
      password: passwordHash,
    },
  });

  const charlie = await prisma.user.create({
    data: {
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      password: passwordHash,
    },
  });

  console.log(`Created users: Alice (${alice.id}), Bob (${bob.id}), Charlie (${charlie.id})`);

  const aliceWallet = await walletRepository.createWallet({
    userId: alice.id,
    currency: 'USD',
    initialBalance: 1500.0,
  });

  const bobWallet = await walletRepository.createWallet({
    userId: bob.id,
    currency: 'USD',
    initialBalance: 500.0,
  });

  const charlieWallet = await walletRepository.createWallet({
    userId: charlie.id,
    currency: 'USD',
    initialBalance: 200.0,
  });

  console.log(`Created wallets:`);
  console.log(`  - Alice: ${aliceWallet.id} ($1,500.00)`);
  console.log(`  - Bob:   ${bobWallet.id} ($500.00)`);
  console.log(`  - Charlie: ${charlieWallet.id} ($200.00)`);

  const transfer = await walletRepository.transferMoneyAtomic(
    aliceWallet.id,
    bobWallet.id,
    250.0,
    'Seed demo transfer: Alice -> Bob'
  );

  console.log(`Demo transfer executed: $250.00 (Ref: ${transfer.referenceId})`);
  console.log('Database seeded successfully.');
}

seed()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
