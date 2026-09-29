export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Wallet Transaction & Transfer API',
    version: '1.0.0',
    description: `
**Production-Ready Wallet Transaction & Transfer Module**

### Core Highlights:
- **ACID Transactions**: Atomic transfers and deposits with row-level integrity.
- **Concurrency & Deadlock Safety**: Deterministic wallet ordering completely prevents database deadlocks during bidirectional transfers.
- **Financial Idempotency**: Support for \`Idempotency-Key\` header with Redis & DB caching prevents duplicate double-spending.
- **Authentication**: JWT Bearer token authentication + support for direct calls.
- **Real-Time Summary**: Balance, credited, debited, and volume metrics.
    `,
    contact: {
      name: 'Backend Developer',
      email: 'developer@example.com',
    },
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token obtained from /api/v1/auth/login or /register',
      },
      IdempotencyKey: {
        type: 'apiKey',
        in: 'header',
        name: 'Idempotency-Key',
        description: 'Unique UUID / key to guarantee idempotency on mutating operations',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Insufficient funds for this transaction' },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'INSUFFICIENT_FUNDS' },
              message: { type: 'string', example: 'Insufficient funds for this transaction' },
            },
          },
        },
      },
      Wallet: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
          userId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          balance: { type: 'number', format: 'float', example: 1250.5 },
          currency: { type: 'string', example: 'USD' },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'FROZEN'], example: 'ACTIVE' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'tx-12345' },
          walletId: { type: 'string' },
          amount: { type: 'number', example: 100.0 },
          type: { type: 'string', enum: ['CREDIT', 'DEBIT'], example: 'CREDIT' },
          category: {
            type: 'string',
            enum: ['DEPOSIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'WITHDRAWAL'],
            example: 'TRANSFER_IN',
          },
          status: { type: 'string', enum: ['SUCCESS', 'PENDING', 'FAILED'], example: 'SUCCESS' },
          balanceBefore: { type: 'number', example: 500.0 },
          balanceAfter: { type: 'number', example: 600.0 },
          referenceId: { type: 'string', example: 'TXF-3fa85f64-5717-4562-b3fc-2c963f66afa6' },
          description: { type: 'string', example: 'Transfer from Alice' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      WalletSummary: {
        type: 'object',
        properties: {
          walletId: { type: 'string' },
          userId: { type: 'string' },
          currency: { type: 'string', example: 'USD' },
          status: { type: 'string', example: 'ACTIVE' },
          currentBalance: { type: 'number', example: 1250.5 },
          totalCredited: { type: 'number', example: 2000.0 },
          totalDebited: { type: 'number', example: 749.5 },
          netVolume: { type: 'number', example: 1250.5 },
          totalTransactions: { type: 'integer', example: 14 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Service Health & Diagnostics',
        responses: {
          200: {
            description: 'API is healthy and operational',
          },
        },
      },
    },
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Alice Smith' },
                  email: { type: 'string', example: 'alice@example.com' },
                  password: { type: 'string', example: 'Password123!' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User registered successfully with JWT token' },
          409: { description: 'Email already registered' },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'alice@example.com' },
                  password: { type: 'string', example: 'Password123!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/api/v1/wallets': {
      post: {
        tags: ['Wallet'],
        summary: 'Create a new wallet',
        description: 'Creates a wallet for a user. One active wallet per user per currency.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  userId: { type: 'string', format: 'uuid', description: 'User ID (if not provided, taken from JWT)' },
                  currency: { type: 'string', default: 'USD', example: 'USD' },
                  initialBalance: { type: 'number', default: 0, example: 500.0 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Wallet created successfully' },
          409: { description: 'User already has an active wallet in this currency' },
        },
      },
    },
    '/api/v1/wallets/{walletId}/add-money': {
      post: {
        tags: ['Wallet'],
        summary: 'Add money / deposit into wallet',
        description: 'Adds money to an active wallet and records an atomic CREDIT transaction.',
        security: [{ BearerAuth: [] }, { IdempotencyKey: [] }],
        parameters: [
          {
            name: 'walletId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Unique idempotency key to prevent double charging',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount'],
                properties: {
                  amount: { type: 'number', example: 250.0 },
                  description: { type: 'string', example: 'Salary deposit' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Funds added successfully' },
          400: { description: 'Invalid amount or wallet inactive' },
        },
      },
    },
    '/api/v1/wallets/{walletId}/transfer': {
      post: {
        tags: ['Wallet'],
        summary: 'Transfer money from User A wallet to User B wallet',
        description: 'Atomic ACID transfer. Validates balance, active status, prevents self-transfer, and locks in deterministic order to prevent deadlocks.',
        security: [{ BearerAuth: [] }, { IdempotencyKey: [] }],
        parameters: [
          {
            name: 'walletId',
            in: 'path',
            required: true,
            description: 'Sender wallet ID',
            schema: { type: 'string' },
          },
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Unique idempotency key for network retries',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['receiverWalletId', 'amount'],
                properties: {
                  receiverWalletId: { type: 'string', example: 'wallet-bob-uuid' },
                  amount: { type: 'number', example: 150.0 },
                  description: { type: 'string', example: 'Dinner split bill' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Transfer executed atomically' },
          400: { description: 'Same user, inactive wallet, or invalid amount' },
          422: { description: 'Insufficient funds in sender wallet' },
        },
      },
    },
    '/api/v1/wallets/{walletId}': {
      get: {
        tags: ['Wallet'],
        summary: 'Get wallet details by ID',
        parameters: [
          { name: 'walletId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Wallet details' },
          404: { description: 'Wallet not found' },
        },
      },
    },
    '/api/v1/wallets/{walletId}/summary': {
      get: {
        tags: ['Wallet'],
        summary: 'Get real-time wallet analytics & summary',
        description: 'Returns current balance, total credited amount, total debited amount, net volume, and transaction count.',
        parameters: [
          { name: 'walletId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Wallet summary data',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WalletSummary',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/transactions/wallet/{walletId}': {
      get: {
        tags: ['Transactions'],
        summary: 'List wallet transaction history with pagination and filters',
        parameters: [
          { name: 'walletId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['CREDIT', 'DEBIT'] } },
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['DEPOSIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'WITHDRAWAL'] } },
          { name: 'fromDate', in: 'query', schema: { type: 'string', format: 'date', example: '2026-01-01' } },
          { name: 'toDate', in: 'query', schema: { type: 'string', format: 'date', example: '2026-12-31' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'createdAt' } },
          { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: {
          200: { description: 'Paginated list of transactions' },
        },
      },
    },
    '/api/v1/transactions/{transactionId}': {
      get: {
        tags: ['Transactions'],
        summary: 'Get transaction details by ID',
        parameters: [
          { name: 'transactionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Transaction details' },
          404: { description: 'Transaction not found' },
        },
      },
    },
  },
};
