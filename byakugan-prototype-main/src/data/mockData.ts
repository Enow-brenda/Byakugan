import { CodebaseNode, CodebaseEdge, ArchitecturePattern, FileTreeNode } from '../types';

export const NODES_DATA: CodebaseNode[] = [
  // FOCAL NODE (Center)
  {
    id: "RefundService.js",
    name: "RefundService.js",
    path: "src/services/RefundService.js",
    type: "Service",
    category: "Services",
    color: "#ec4899",
    loc: 184,
    role: "Central business orchestration for customer card refunds, handling currency normalization, idempotency locking, and ledger write commits.",
    riskScore: "8.8 / 10",
    riskLevel: "HIGH IMPACT",
    complexity: "14 (Critical)",
    astFlag: "In-place mutation flagged on line 74: `context.txPayload.state = 'MUTATED'`",
    x: 0,
    y: 0,
    r: 28,
    isFocal: true,
    beginner: {
      tagline: "The core traffic controller for taking care of refunds.",
      role: "Takes in refund requests from users or staff, validates the numbers, reserves the lock, and commands the ledger and Stripe to pay back money.",
      badge: "⚠ High impact: connected to 7 other modules",
      whatItDoes: "Takes customer refund requests, checks whether they are valid, locks transaction records so refunds aren't sent twice, and commands both Stripe and your database to safely update account balance.",
      whoUsesIt: "RefundController (website/app), AdminPanel (customer support staff), BatchProcessor (nightly dispute files), WebhookHandler (Stripe dispute events).",
      whatItUses: "StripeGateway (credit card reversals), LedgerRepository (database books), RedisCache (locking to prevent double clicks), and NotificationClient (sends customer emails).",
      whyItMatters: "If this file breaks or makes an error, real money could be double refunded, lost, or trapped in an unfinished transaction state."
    },
    senior: {
      archRole: "Application Service coordinating multi-gateway refund state transitions, distributed lock lifecycles, and atomic double-entry balance updates.",
      stateMutation: "CRITICAL: `paymentContext` is modified in-place at line 74 prior to the ledger write operation. This breaks idempotency if an unhandled promise rejection occurs during the gateway round-trip.",
      uncoveredFailures: [
        "Network timeout during StripeGateway.createChargeReversal does not trigger automated compensation ledger rollback (causes phantom debit).",
        "Race condition on RedisCache lock release under high Redis replica sync lag (>120ms)."
      ],
      propagationRadius: "7 direct nodes (3 Upstream Ingress, 4 Downstream Egress). Blast Radius: 8.8/10 across settlement pipelines.",
      concerns: [
        "Violates Single Responsibility Principle by interleaving raw SQL transaction handles with external third-party SDK calls.",
        "Lacks an outbox pattern for Kafka audit emissions, allowing divergent state during database rollbacks."
      ],
      safeMigration: [
        "1. Extract paymentContext hydration into a pure, immutable value object builder.",
        "2. Decouple StripeGateway invocation using a transactional Saga coordinator.",
        "3. Enforce strict database idempotency constraint with deterministic transaction UUIDs."
      ]
    }
  },

  // INBOUND UPSTREAM / CONTROLLERS
  {
    id: "RefundController.js",
    name: "RefundController.js",
    path: "src/controllers/RefundController.js",
    type: "Controller",
    category: "Controllers",
    color: "#38bdf8",
    loc: 112,
    role: "Public API gateway endpoint routing POST /api/v1/refunds with payload validation and rate limiting.",
    riskScore: "4.2 / 10",
    riskLevel: "MODERATE",
    complexity: "6 (Normal)",
    astFlag: "None. Sanitized request mapping.",
    x: -240,
    y: -130,
    r: 19,
    beginner: {
      tagline: "The front reception desk for user refund requests.",
      role: "Receives user HTTP requests, checks whether parameters look right, and passes them to the RefundService.",
      badge: "Medium impact: Entry point from public API",
      whatItDoes: "Checks if the customer is logged in, validates that the amount is greater than zero, and forwards the command.",
      whoUsesIt: "Web application and mobile app payment interfaces.",
      whatItUses: "AuthService to check user identities and RefundService to process the refund.",
      whyItMatters: "First line of defense against spam or invalid refund submissions."
    },
    senior: {
      archRole: "Edge API Controller handling HTTP transport decoding, payload schema validation (Joi/Zod), and rate-limit guard rails.",
      stateMutation: "Pure controller. No internal state mutated.",
      uncoveredFailures: ["HTTP 499 client disconnect is not propagated downstream to cancel ongoing async RefundService operations."],
      propagationRadius: "Calls AuthService and RefundService directly.",
      concerns: ["Exposes internal error stack traces on unhandled gateway timeouts."],
      safeMigration: ["Adopt schema validation pipeline middleware with standardized RFC 7807 Problem Details responses."]
    }
  },
  {
    id: "AdminPanel.js",
    name: "AdminPanel.js",
    path: "src/controllers/AdminPanel.js",
    type: "Controller",
    category: "Controllers",
    color: "#38bdf8",
    loc: 96,
    role: "CSR administrative router enabling manual authorization override for disputed charge reversals.",
    riskScore: "5.5 / 10",
    riskLevel: "ELEVATED",
    complexity: "7 (Normal)",
    astFlag: "Bypasses standard rate-limiting token bucket.",
    x: -290,
    y: 0,
    r: 18,
    beginner: {
      tagline: "Support desk tool for customer service representatives.",
      role: "Allows customer support agents to manually issue refunds when an order went wrong.",
      badge: "Special permissions: Internal staff tool",
      whatItDoes: "Permits authorized staff to override standard limits to make things right for unhappy buyers.",
      whoUsesIt: "Support agents and admin portal dashboard.",
      whatItUses: "AuthService (checks employee level) and RefundService (executes the reversal).",
      whyItMatters: "High power: ensures support staff can resolve disputes directly."
    },
    senior: {
      archRole: "Privileged Internal REST Controller executing supervisor token verification and override audit trail tagging.",
      stateMutation: "Appends manual operator session ID to the execution metadata context.",
      uncoveredFailures: ["Dual-supervisor signoff bypass possible on amounts exceeding $2,500 threshold."],
      propagationRadius: "Directly invokes RefundService bypassing customer throttle rules.",
      concerns: ["Rate-limiting bypass creates potential vulnerability to employee token theft abuse."],
      safeMigration: ["Implement fine-grained zero-trust permission token assertion before invoking RefundService."]
    }
  },
  {
    id: "BatchProcessor.js",
    name: "BatchProcessor.js",
    path: "src/workers/BatchProcessor.js",
    type: "Worker",
    category: "External",
    color: "#fbbf24",
    loc: 135,
    role: "Cron-triggered worker consuming bulk settlement schedules and merchant dispute reconciliations.",
    riskScore: "6.1 / 10",
    riskLevel: "ELEVATED",
    complexity: "8 (Elevated)",
    astFlag: "Unbounded promise pool chunk size.",
    x: -240,
    y: 130,
    r: 18,
    beginner: {
      tagline: "The overnight night-shift worker.",
      role: "Runs scheduled jobs to settle batches of disputed payments in bulk.",
      badge: "Background Worker: Runs automatically on schedule",
      whatItDoes: "Reads lists of disputes from banks and automatically initiates refunds for approved disputes.",
      whoUsesIt: "Automated cron schedulers.",
      whatItUses: "RedisCache for locking and RefundService to trigger each refund.",
      whyItMatters: "Prevents delayed dispute penalties from card networks."
    },
    senior: {
      archRole: "Asynchronous Batch Ingestion Daemon streaming reconciliation records from upstream merchant clearing houses.",
      stateMutation: "Mutates batch cursor state in Redis with sliding-window expiry.",
      uncoveredFailures: ["Memory ballooning when batch size > 5,000 items due to Promise.all chunk allocation."],
      propagationRadius: "Triggers sequential RefundService calls.",
      concerns: ["Lacks backpressure flow control against database transaction pool."],
      safeMigration: ["Replace unbounded promise chunking with Node.js stream backpressure or bullmq queue."]
    }
  },

  // OUTBOUND REPOSITORIES & GATEWAYS
  {
    id: "PaymentContext.js",
    name: "PaymentContext.js",
    path: "src/models/PaymentContext.js",
    type: "Model",
    category: "Models",
    color: "#fbbf24",
    loc: 75,
    role: "Immutable domain entity holding transaction metadata, correlation IDs, and actor scopes.",
    riskScore: "4.7 / 10",
    riskLevel: "LOW RISK",
    complexity: "4 (Clean)",
    astFlag: "Constructor freeze validation missing.",
    x: -70,
    y: -190,
    r: 17,
    beginner: {
      tagline: "The passport and ID papers of the refund transaction.",
      role: "Holds the receipt details, user ID, and money currency so everyone has the same facts.",
      badge: "Data Model: Keeps information organized",
      whatItDoes: "Packages up transaction details into a neat folder that all other services can read.",
      whoUsesIt: "RefundService, OrderService, and Controllers.",
      whatItUses: "Self-contained data object.",
      whyItMatters: "Ensures no fields like transaction amount or currency code get mixed up."
    },
    senior: {
      archRole: "Domain Value Object maintaining transaction invariants, traceparent correlation headers, and currency enums.",
      stateMutation: "Vulnerable to external mutations: Object.freeze() is not invoked upon instantiation.",
      uncoveredFailures: ["Floating-point precision rounding when handling mixed currency conversions."],
      propagationRadius: "Read across 3 domain services.",
      concerns: ["Mutable fields permit accidental cross-module data leakage during asynchronous lifecycle."],
      safeMigration: ["Refactor into an immutable TypeScript class using readonly properties and branded types."]
    }
  },
  {
    id: "LedgerRepository.js",
    name: "LedgerRepository.js",
    path: "src/repositories/LedgerRepository.js",
    type: "Repository",
    category: "Repositories",
    color: "#34d399",
    loc: 310,
    role: "Double-entry accounting persistence layer performing atomic debit/credit writes with row lock.",
    riskScore: "7.9 / 10",
    riskLevel: "HIGH IMPACT",
    complexity: "11 (High)",
    astFlag: "Direct raw SQL query with explicit row lock (FOR UPDATE).",
    x: 230,
    y: -90,
    r: 21,
    beginner: {
      tagline: "The master accounting ledger book in the database.",
      role: "Writes down every penny that enters or leaves so accounts always balance perfectly.",
      badge: "⚠ Critical: Records actual money movements",
      whatItDoes: "Adds an accounting entry debiting the merchant and crediting the customer.",
      whoUsesIt: "RefundService and PaymentWorker.",
      whatItUses: "The PostgreSQL Database.",
      whyItMatters: "If ledger records are inaccurate, financial balances won't balance at month-end."
    },
    senior: {
      archRole: "Double-Entry Accounting Persistence Gateway with explicit row-level serialization (SELECT FOR UPDATE).",
      stateMutation: "Directly creates ACID ledger records with debit/credit balance constraint verification.",
      uncoveredFailures: ["Database deadlocks if debit and credit account IDs are locked in asymmetric order."],
      propagationRadius: "Critical database write boundary to PostgreSQL.",
      concerns: ["Heavy lock contention on high-velocity merchant accounts during promotion peaks."],
      safeMigration: ["Sort account keys lexicographically prior to row locking to eliminate lock cycle deadlocks."]
    }
  },
  {
    id: "StripeGateway.ts",
    name: "StripeGateway.ts",
    path: "src/gateways/StripeGateway.ts",
    type: "External API",
    category: "External",
    color: "#f97316",
    loc: 245,
    role: "External Stripe SDK wrapper managing idempotency tokens, TLS sessions, and payment reversal calls.",
    riskScore: "8.1 / 10",
    riskLevel: "CRITICAL OUTLET",
    complexity: "12 (High)",
    astFlag: "Retry timeout fallback creates unhandled rejections under 504s.",
    x: 250,
    y: 60,
    r: 20,
    beginner: {
      tagline: "The telephone hotline to Stripe credit card processing.",
      role: "Sends the message over the internet to Stripe telling them to send money back to the cardholder.",
      badge: "External partner: Talks to Visa/Mastercard",
      whatItDoes: "Contacts Stripe securely, tells them the refund amount, and listens for the approval confirmation.",
      whoUsesIt: "RefundService, PaymentWorker, and WebhookHandler.",
      whatItUses: "Stripe's cloud servers.",
      whyItMatters: "Actually moves the customer's real money across the banking network."
    },
    senior: {
      archRole: "Infrastructure Gateway Adapter abstracting third-party payment rail REST calls with idempotency keys.",
      stateMutation: "Transient HTTP circuit-breaker state modified in memory.",
      uncoveredFailures: ["Stripe 504 gateway timeout triggers retry without verifying if original charge reversal succeeded."],
      propagationRadius: "External network egress.",
      concerns: ["SDK version lock-in; unhandled edge case during partial charge reversals."],
      safeMigration: ["Implement exponential backoff circuit breaker with idempotency verification query."]
    }
  },
  {
    id: "AuditLogQueue.js",
    name: "AuditLogQueue.js",
    path: "src/queues/AuditLogQueue.js",
    type: "Queue",
    category: "External",
    color: "#a855f7",
    loc: 88,
    role: "SOC2/PCI-DSS tamper-evident audit journal stream with append-only sequence tracking.",
    riskScore: "3.1 / 10",
    riskLevel: "LOW RISK",
    complexity: "3 (Clean)",
    astFlag: "None. Append-only sequence stream.",
    x: 170,
    y: 180,
    r: 17
  },
  {
    id: "NotificationClient.ts",
    name: "NotificationClient.ts",
    path: "src/clients/NotificationClient.ts",
    type: "External API",
    category: "External",
    color: "#f97316",
    loc: 140,
    role: "Multi-channel event publisher dispatching webhooks, Slack alerts, and customer transactional receipts.",
    riskScore: "4.0 / 10",
    riskLevel: "LOW RISK",
    complexity: "5 (Normal)",
    astFlag: "Fire-and-forget promise lacks backoff envelope.",
    x: 10,
    y: 200,
    r: 17
  },
  {
    id: "RefundService.test.js",
    name: "RefundService.test.js",
    path: "test/services/RefundService.test.js",
    type: "Test",
    category: "External",
    color: "#06b6d4",
    loc: 220,
    role: "Unit and mock test suite verifying edge cases, currency conversions, and idempotency rejection.",
    riskScore: "1.2 / 10",
    riskLevel: "TEST HARNESS",
    complexity: "6 (Test)",
    astFlag: "Covers 82.4% of execution branches.",
    x: -120,
    y: 190,
    r: 17
  },

  // BROADER ARCHITECTURE
  {
    id: "AuthService.js",
    name: "AuthService.js",
    path: "src/services/AuthService.js",
    type: "Service",
    category: "Services",
    color: "#a855f7",
    loc: 165,
    role: "Authentication token verification, role-based access control, and API token hashing.",
    riskScore: "7.2 / 10",
    riskLevel: "HIGH IMPACT",
    complexity: "10 (High)",
    astFlag: "JWT verification algorithm not pinned in config.",
    x: -420,
    y: -100,
    r: 18
  },
  {
    id: "UserService.js",
    name: "UserService.js",
    path: "src/services/UserService.js",
    type: "Service",
    category: "Services",
    color: "#a855f7",
    loc: 140,
    role: "User profile management, customer dispute records, and tier authorization limits.",
    riskScore: "5.1 / 10",
    riskLevel: "MODERATE",
    complexity: "7 (Normal)",
    astFlag: "None.",
    x: -380,
    y: -230,
    r: 18
  },
  {
    id: "OrderService.js",
    name: "OrderService.js",
    path: "src/services/OrderService.js",
    type: "Service",
    category: "Services",
    color: "#a855f7",
    loc: 210,
    role: "Merchant checkout lifecycle, line-item tax calculations, and fulfillment status updates.",
    riskScore: "6.8 / 10",
    riskLevel: "ELEVATED",
    complexity: "9 (High)",
    astFlag: "Cart state synchronization race condition.",
    x: 100,
    y: -240,
    r: 19
  },
  {
    id: "OrderController.js",
    name: "OrderController.js",
    path: "src/controllers/OrderController.js",
    type: "Controller",
    category: "Controllers",
    color: "#38bdf8",
    loc: 118,
    role: "REST endpoints for cart checkout, order query, and line-item dispute inquiries.",
    riskScore: "4.1 / 10",
    riskLevel: "LOW RISK",
    complexity: "5 (Normal)",
    astFlag: "Standard route schema.",
    x: -80,
    y: -310,
    r: 17
  },
  {
    id: "PaymentRepository.js",
    name: "PaymentRepository.js",
    path: "src/repositories/PaymentRepository.js",
    type: "Repository",
    category: "Repositories",
    color: "#34d399",
    loc: 260,
    role: "Primary transaction records persistence, charge capture states, and balance locks.",
    riskScore: "7.5 / 10",
    riskLevel: "HIGH IMPACT",
    complexity: "10 (High)",
    astFlag: "Direct connection pooling overload under spike.",
    x: 390,
    y: -190,
    r: 19
  },
  {
    id: "RefundRepository.js",
    name: "RefundRepository.js",
    path: "src/repositories/RefundRepository.js",
    type: "Repository",
    category: "Repositories",
    color: "#34d399",
    loc: 190,
    role: "CRUD queries for refund records, dispute tracking, and merchant reconciliation.",
    riskScore: "6.0 / 10",
    riskLevel: "MODERATE",
    complexity: "8 (Normal)",
    astFlag: "Missing composite index on merchantId + createdAt.",
    x: 420,
    y: -40,
    r: 18
  },
  {
    id: "TransactionModel.js",
    name: "TransactionModel.js",
    path: "src/models/TransactionModel.js",
    type: "Model",
    category: "Models",
    color: "#fbbf24",
    loc: 95,
    role: "ORM schema definition mapping transactional ledgers, timestamps, and fees.",
    riskScore: "3.5 / 10",
    riskLevel: "LOW RISK",
    complexity: "3 (Clean)",
    astFlag: "None.",
    x: 280,
    y: -290,
    r: 16
  },
  {
    id: "UserRepository.js",
    name: "UserRepository.js",
    path: "src/repositories/UserRepository.js",
    type: "Repository",
    category: "Repositories",
    color: "#34d399",
    loc: 175,
    role: "Data access object for customer profiles, payment tokens, and KYC statuses.",
    riskScore: "5.3 / 10",
    riskLevel: "MODERATE",
    complexity: "6 (Normal)",
    astFlag: "None.",
    x: -470,
    y: -310,
    r: 17
  },
  {
    id: "WebhookHandler.js",
    name: "WebhookHandler.js",
    path: "src/workers/WebhookHandler.js",
    type: "Worker",
    category: "External",
    color: "#fbbf24",
    loc: 110,
    role: "Asynchronous ingress for third-party Stripe and banking charge reversal callbacks.",
    riskScore: "6.3 / 10",
    riskLevel: "ELEVATED",
    complexity: "8 (Elevated)",
    astFlag: "Signature verification must precede JSON parse.",
    x: 410,
    y: 110,
    r: 17
  },
  {
    id: "PaymentWorker.js",
    name: "PaymentWorker.js",
    path: "src/workers/PaymentWorker.js",
    type: "Worker",
    category: "External",
    color: "#fbbf24",
    loc: 150,
    role: "Background queue consumer running asynchronous capture, settlement retries, and ledger syncing.",
    riskScore: "6.9 / 10",
    riskLevel: "ELEVATED",
    complexity: "9 (High)",
    astFlag: "Exponential backoff ceiling missing.",
    x: 320,
    y: 240,
    r: 18
  },
  {
    id: "Database (PostgreSQL)",
    name: "Database (PostgreSQL)",
    path: "infra/database/postgres.cluster",
    type: "Database",
    category: "Repositories",
    color: "#10b981",
    loc: 0,
    role: "Primary ACID relational data cluster with multi-region write replica and snapshot replication.",
    riskScore: "9.2 / 10",
    riskLevel: "INFRA CRITICAL",
    complexity: "Max (Infra)",
    astFlag: "Deadlock prevention policy active.",
    x: 520,
    y: -140,
    r: 23
  },
  {
    id: "RedisCache",
    name: "RedisCache",
    path: "infra/cache/redis.cluster",
    type: "Utility/Cache",
    category: "External",
    color: "#f43f5e",
    loc: 0,
    role: "In-memory distributed key-value store managing idempotency mutex locks and cached FX rates.",
    riskScore: "7.0 / 10",
    riskLevel: "HIGH IMPACT",
    complexity: "Cluster",
    astFlag: "TTL policy: volatile-lru.",
    x: -160,
    y: -30,
    r: 19
  },
  {
    id: "KafkaPublisher",
    name: "KafkaPublisher",
    path: "infra/kafka/event-bus",
    type: "Queue",
    category: "External",
    color: "#c084fc",
    loc: 0,
    role: "Enterprise streaming event bus broadcasting payment, settlement, and customer audit events.",
    riskScore: "6.5 / 10",
    riskLevel: "HIGH VOLUME",
    complexity: "Cluster",
    astFlag: "Partition key: merchant_id.",
    x: -70,
    y: 280,
    r: 19
  }
];

export const EDGES_DATA: CodebaseEdge[] = [
  // RefundService Inbound & Outbound
  {
    source: "RefundController.js",
    target: "RefundService.js",
    relation: "calls",
    loc: 42,
    contract: "invokeProcessRefund(req.body, req.user)",
    beginner: "RefundController sends refund requests to RefundService",
    senior: "Synchronous HTTP controller invocation with unvalidated JWT scope"
  },
  {
    source: "AdminPanel.js",
    target: "RefundService.js",
    relation: "calls",
    loc: 68,
    contract: "forceAuthorizeRefund(overrideToken, refundId)",
    beginner: "AdminPanel lets customer support force a refund directly",
    senior: "Privileged override dispatching direct mutation of settled ledger entries"
  },
  {
    source: "BatchProcessor.js",
    target: "RefundService.js",
    relation: "calls",
    loc: 87,
    contract: "processBatchRecord(queueMessage.item)",
    beginner: "BatchProcessor feeds lists of refunds from nightly files",
    senior: "Unthrottled cron worker streaming async task items into main thread"
  },
  {
    source: "RefundService.js",
    target: "PaymentContext.js",
    relation: "reads",
    loc: 74,
    contract: "hydrateContext(rawRequestPayload)",
    beginner: "RefundService looks up transaction information in PaymentContext",
    senior: "In-place object mutation on reference pointer prior to ledger commit"
  },
  {
    source: "RefundService.js",
    target: "LedgerRepository.js",
    relation: "writes",
    loc: 102,
    contract: "commitDoubleEntryDebit(txPayload)",
    beginner: "RefundService uses LedgerRepository to save refund information",
    senior: "Atomic double-entry SQL write with pessimistic row locking (SELECT FOR UPDATE)"
  },
  {
    source: "RefundService.js",
    target: "StripeGateway.ts",
    relation: "calls",
    loc: 142,
    contract: "createChargeReversal(ctx.chargeId, ctx.cents)",
    beginner: "RefundService tells Stripe to return money to customer's card",
    senior: "Synchronous external TLS round-trip with timeout retry amplification risk"
  },
  {
    source: "RefundService.js",
    target: "AuditLogQueue.js",
    relation: "publishes",
    loc: 118,
    contract: "journalComplianceEntry('REFUND_INIT', ctx)",
    beginner: "RefundService logs a security note that a refund was issued",
    senior: "Non-transactional audit emission vulnerable to state divergence"
  },
  {
    source: "RefundService.js",
    target: "NotificationClient.ts",
    relation: "publishes",
    loc: 165,
    contract: "emit('payment.refunded', ctx.summary)",
    beginner: "RefundService emails the customer confirming their refund",
    senior: "Fire-and-forget notification publish lacking backpressure retry queue"
  },
  {
    source: "RefundService.test.js",
    target: "RefundService.js",
    relation: "tests",
    loc: 12,
    contract: "describe('RefundService AST Suite')",
    beginner: "Automated test suite checking that RefundService works properly",
    senior: "Mocked unit harness verifying state machine transitions (82.4% branch coverage)"
  },
  {
    source: "RefundService.js",
    target: "RedisCache",
    relation: "calls",
    loc: 33,
    contract: "acquireRedlock(ctx.idempotencyKey, 15000)",
    beginner: "RefundService locks the refund so double clicks don't charge twice",
    senior: "Distributed Redlock acquisition with 15,000ms TTL and clock drift tolerance"
  },
  {
    source: "RefundService.js",
    target: "RefundRepository.js",
    relation: "writes",
    loc: 115,
    contract: "persistRefundStatus(refundRecord)",
    beginner: "RefundService updates the refund status in the database",
    senior: "Idempotent state record update with correlation timestamp synchronization"
  },

  // Cross Architecture
  { source: "RefundController.js", target: "AuthService.js", relation: "calls", loc: 24, contract: "verifyBearerToken(req.headers)" },
  { source: "AdminPanel.js", target: "AuthService.js", relation: "calls", loc: 31, contract: "validateAdminPrivilege(session)" },
  { source: "AuthService.js", target: "UserRepository.js", relation: "reads", loc: 54, contract: "findUserBySession(tokenHash)" },
  { source: "OrderController.js", target: "OrderService.js", relation: "calls", loc: 36, contract: "handleCreateOrder(orderReq)" },
  { source: "OrderController.js", target: "AuthService.js", relation: "calls", loc: 19, contract: "authenticateRequest(req)" },
  { source: "UserService.js", target: "UserRepository.js", relation: "reads", loc: 41, contract: "getProfile(userId)" },
  { source: "OrderService.js", target: "PaymentContext.js", relation: "reads", loc: 88, contract: "buildCheckoutContext(cart)" },
  { source: "OrderService.js", target: "PaymentRepository.js", relation: "writes", loc: 130, contract: "recordOrderCharge(txRecord)" },
  { source: "OrderService.js", target: "TransactionModel.js", relation: "reads", loc: 45, contract: "validateSchema(orderPayload)" },
  { source: "PaymentRepository.js", target: "TransactionModel.js", relation: "reads", loc: 28, contract: "mapSchema(row)" },
  { source: "PaymentRepository.js", target: "Database (PostgreSQL)", relation: "writes", loc: 72, contract: "SQL: INSERT INTO transactions (...)" },
  { source: "LedgerRepository.js", target: "Database (PostgreSQL)", relation: "writes", loc: 94, contract: "SQL: BEGIN; INSERT INTO ledger_entries ..." },
  { source: "RefundRepository.js", target: "Database (PostgreSQL)", relation: "writes", loc: 50, contract: "SQL: UPDATE refunds SET status = ..." },
  { source: "UserRepository.js", target: "Database (PostgreSQL)", relation: "reads", loc: 62, contract: "SQL: SELECT * FROM users WHERE ..." },
  { source: "WebhookHandler.js", target: "StripeGateway.ts", relation: "calls", loc: 48, contract: "verifyStripeSignature(rawPayload, header)" },
  { source: "WebhookHandler.js", target: "RefundService.js", relation: "calls", loc: 77, contract: "onDisputeClosedWebhook(evt)" },
  { source: "PaymentWorker.js", target: "PaymentRepository.js", relation: "reads", loc: 60, contract: "fetchPendingCaptures(50)" },
  { source: "PaymentWorker.js", target: "StripeGateway.ts", relation: "calls", loc: 85, contract: "captureCharge(chargeId)" },
  { source: "PaymentWorker.js", target: "LedgerRepository.js", relation: "writes", loc: 110, contract: "commitSettleCredit(entry)" },
  { source: "AuditLogQueue.js", target: "KafkaPublisher", relation: "publishes", loc: 40, contract: "publishStream('audit.events', payload)" },
  { source: "NotificationClient.ts", target: "KafkaPublisher", relation: "publishes", loc: 52, contract: "publishStream('user.notifications', payload)" },
  { source: "BatchProcessor.js", target: "RedisCache", relation: "calls", loc: 44, contract: "getLock('batch_runner')" },
  { source: "UserService.js", target: "RedisCache", relation: "reads", loc: 33, contract: "cacheGet(`user:${id}`)" },
  { source: "RefundService.test.js", target: "LedgerRepository.js", relation: "tests", loc: 85, contract: "assertLedgerBalancesEqual(testTx)" },
  { source: "RefundController.js", target: "PaymentContext.js", relation: "reads", loc: 50, contract: "parseContext(req.body)" },
  { source: "PaymentRepository.js", target: "RedisCache", relation: "calls", loc: 91, contract: "invalidateKey(`charge:${id}`)" }
];

export const PATTERNS_DATA: ArchitecturePattern[] = [
  {
    id: "repo-pattern",
    name: "Repository Pattern",
    category: "structural",
    categoryLabel: "Structural / Data Access",
    astScore: "94/100",
    healthStatus: "Healthy (99/100)",
    occurrences: [
      { file: "src/repositories/PaymentRepository.ts", line: 18 },
      { file: "src/repositories/LedgerRepository.ts", line: 24 },
      { file: "src/repositories/RefundRepository.ts", line: 12 },
      { file: "src/repositories/UserRepository.ts", line: 30 }
    ],
    plainDefinition: "Decouples database query mechanics from business logic using typed collection-like interfaces.",
    whyItMatters: "Enables frictionless mocking in unit tests and cleanly isolates database schema migrations from service logic.",
    withoutItRisk: "Direct SQL/Knex calls leak into HTTP controllers, making testing require a live database setup and increasing fragility.",
    codeSnippetTitle: "interface IPaymentRepository",
    codeSnippetFile: "src/repositories/IPaymentRepository.ts",
    codeSnippet: `// src/repositories/IPaymentRepository.ts
export interface IPaymentRepository {
  findById(id: string): Promise<Payment | null>;
  persist(payment: Payment): Promise<void>;
  updateStatus(id: string, status: PaymentStatus): Promise<boolean>;
  findRecentByCustomer(customerId: string, limit: number): Promise<Payment[]>;
}`
  },
  {
    id: "di-pattern",
    name: "Dependency Injection",
    category: "creational",
    categoryLabel: "Creational",
    astScore: "99/100",
    healthStatus: "Healthy (95/100)",
    occurrences: [
      { file: "src/services/PaymentProcessor.ts", line: 32 },
      { file: "src/container.ts", line: 12 }
    ],
    plainDefinition: "Supplies gateway clients and database connections through constructor arguments rather than hardcoded new instances.",
    whyItMatters: "Essential for seamlessly swapping live Stripe with mock sandbox gateways in test suites and local staging.",
    withoutItRisk: "Tight coupling makes testing edge cases, timeouts, and gateway failure cascades virtually impossible.",
    codeSnippetTitle: "constructor injection in PaymentProcessor",
    codeSnippetFile: "src/services/PaymentProcessor.ts",
    codeSnippet: `// src/services/PaymentProcessor.ts
export class PaymentProcessor {
  constructor(
    private readonly repo: IPaymentRepository,
    private readonly gateway: IPaymentGateway,
    private readonly idempotency: IIdempotencyStore
  ) {}
}`
  },
  {
    id: "idempotency-pattern",
    name: "Idempotency Key Consumer",
    category: "concurrency",
    categoryLabel: "Concurrency & Reliability",
    astScore: "Mission Critical",
    healthStatus: "Active",
    occurrences: [
      { file: "src/middleware/idempotency.ts", line: 40 },
      { file: "src/services/PaymentProcessor.ts", line: 77 }
    ],
    plainDefinition: "Guarantees that repeating an identical payment request returns the cached result without double charging.",
    whyItMatters: "Prevents duplicate charges during spotty mobile network re-transmissions or sudden upstream gateway timeouts.",
    withoutItRisk: "Customers get billed multiple times for a single checkout tap, triggering high chargeback ratios and revenue leaks.",
    codeSnippetTitle: "Redis SETNX atomic lock routine",
    codeSnippetFile: "src/middleware/idempotency.ts",
    codeSnippet: `// src/middleware/idempotency.ts
const acquired = await redis.set(
  \`idemp:\${key}\`, 
  'PENDING', 
  'NX', 
  'EX', 
  120
);
if (!acquired) {
  return res.status(409).json({ error: 'Concurrent payload executing' });
}`
  },
  {
    id: "circuit-breaker-pattern",
    name: "Circuit Breaker Pattern",
    category: "behavioral",
    categoryLabel: "Behavioral / Resiliency",
    astScore: "Fail-Open / Tripped 0",
    healthStatus: "Active",
    occurrences: [
      { file: "src/integrations/StripeGateway.ts", line: 104 }
    ],
    plainDefinition: "Temporarily halts outbound HTTP requests to Stripe when failure rates exceed 50%, returning graceful degraded responses.",
    whyItMatters: "Prevents event loop starvation, Node thread pool exhaustion, and cascading downstream collapse during outages.",
    withoutItRisk: "The entire payment API freezes waiting for 30s timeout requests to complete, exhausting socket connections.",
    codeSnippetTitle: "Opossum breaker fallback dispatch",
    codeSnippetFile: "src/integrations/StripeGateway.ts",
    codeSnippet: `// src/integrations/StripeGateway.ts
const breaker = new CircuitBreaker(executeStripeCharge, {
  timeout: 4000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});
breaker.fallback(() => enqueueForDelayedSync(payload));`
  },
  {
    id: "transactional-outbox",
    name: "Transactional Outbox",
    category: "behavioral",
    categoryLabel: "Behavioral / Event-Driven",
    astScore: "96/100",
    healthStatus: "Guaranteed Delivery",
    occurrences: [
      { file: "src/workers/OutboxWorker.ts", line: 45 },
      { file: "src/repositories/LedgerRepository.ts", line: 112 }
    ],
    plainDefinition: "Writes domain events to an outbox table within the same database transaction as business state changes before relaying to Kafka.",
    whyItMatters: "Eliminates dual-write divergence between ACID SQL databases and asynchronous message streams like Kafka.",
    withoutItRisk: "If message publish fails after database commit, downstream services never receive events, causing unrecoverable state drift.",
    codeSnippetTitle: "Outbox transaction enqueue routine",
    codeSnippetFile: "src/repositories/LedgerRepository.ts",
    codeSnippet: `// src/repositories/LedgerRepository.ts
await knex.transaction(async (trx) => {
  await trx('ledger_entries').insert(entry);
  await trx('outbox_events').insert({
    topic: 'payment.settled',
    payload: JSON.stringify(entry),
    created_at: new Date()
  });
});`
  },
  {
    id: "saga-coordinator",
    name: "Saga Orchestrator",
    category: "behavioral",
    categoryLabel: "Behavioral / Distributed Transactions",
    astScore: "91/100",
    healthStatus: "Compensating Actions Active",
    occurrences: [
      { file: "src/services/RefundSaga.ts", line: 60 }
    ],
    plainDefinition: "Manages distributed multi-step transactions using explicit compensating rollbacks when any intermediate step fails.",
    whyItMatters: "Enables multi-gateway card settlement and ledger balance adjustments without locking multiple databases via 2PC.",
    withoutItRisk: "Partial failures leave external Stripe refunds processed while local merchant accounts remain un-debited.",
    codeSnippetTitle: "Compensating rollback step execution",
    codeSnippetFile: "src/services/RefundSaga.ts",
    codeSnippet: `// src/services/RefundSaga.ts
try {
  await stripe.refund(chargeId);
  await ledger.credit(accountId, amount);
} catch (err) {
  await this.compensateLedger(accountId, amount);
  throw new SagaRollbackException('Refund saga reversed successfully', err);
}`
  }
];

export const FILE_TREE_DATA: FileTreeNode[] = [
  {
    id: "folder-src",
    name: "src",
    path: "src",
    type: "folder",
    badge: "root",
    children: [
      {
        id: "folder-config",
        name: "config",
        path: "src/config",
        type: "folder",
        count: 2,
        children: [
          { id: "file-app-config", name: "app.config.ts", path: "src/config/app.config.ts", type: "file", badge: "ts", lines: 48 },
          { id: "file-redis-config", name: "redis.config.ts", path: "src/config/redis.config.ts", type: "file", badge: "ts", lines: 35 }
        ]
      },
      {
        id: "folder-controllers",
        name: "controllers",
        path: "src/controllers",
        type: "folder",
        count: 4,
        children: [
          { id: "file-checkout-ctrl", name: "CheckoutController.ts", path: "src/controllers/CheckoutController.ts", type: "file", badge: "ts", lines: 112 },
          { id: "file-refund-ctrl", name: "RefundController.js", path: "src/controllers/RefundController.js", type: "file", badge: "js", lines: 98 },
          { id: "file-admin-panel", name: "AdminPanel.js", path: "src/controllers/AdminPanel.js", type: "file", badge: "js", lines: 96 },
          { id: "file-order-ctrl", name: "OrderController.js", path: "src/controllers/OrderController.js", type: "file", badge: "js", lines: 84 }
        ]
      },
      {
        id: "folder-middleware",
        name: "middleware",
        path: "src/middleware",
        type: "folder",
        count: 3,
        children: [
          { id: "file-idempotency-mw", name: "idempotency.ts", path: "src/middleware/idempotency.ts", type: "file", badge: "ts", lines: 65 },
          { id: "file-auth-mw", name: "auth.ts", path: "src/middleware/auth.ts", type: "file", badge: "ts", lines: 52 },
          { id: "file-rate-limit-mw", name: "rateLimiter.ts", path: "src/middleware/rateLimiter.ts", type: "file", badge: "ts", lines: 41 }
        ]
      },
      {
        id: "folder-models",
        name: "models",
        path: "src/models",
        type: "folder",
        count: 5,
        children: [
          { id: "file-payment-ctx", name: "PaymentContext.js", path: "src/models/PaymentContext.js", type: "file", badge: "js", lines: 75 },
          { id: "file-tx-model", name: "TransactionModel.js", path: "src/models/TransactionModel.js", type: "file", badge: "js", lines: 95 },
          { id: "file-refund-model", name: "RefundRecord.ts", path: "src/models/RefundRecord.ts", type: "file", badge: "ts", lines: 62 },
          { id: "file-ledger-model", name: "LedgerEntry.ts", path: "src/models/LedgerEntry.ts", type: "file", badge: "ts", lines: 58 },
          { id: "file-user-model", name: "UserModel.ts", path: "src/models/UserModel.ts", type: "file", badge: "ts", lines: 70 }
        ]
      },
      {
        id: "folder-services",
        name: "services",
        path: "src/services",
        type: "folder",
        count: 4,
        children: [
          { id: "file-payment-processor", name: "PaymentProcessor.ts", path: "src/services/PaymentProcessor.ts", type: "file", badge: "CORE", badgeType: "core", lines: 412 },
          { id: "file-refund-service", name: "RefundService.js", path: "src/services/RefundService.js", type: "file", badge: "js", lines: 184 },
          { id: "file-stripe-gateway", name: "StripeGateway.ts", path: "src/services/StripeGateway.ts", type: "file", badge: "ts", lines: 245 },
          { id: "file-adyen-gateway", name: "AdyenGateway.ts", path: "src/services/AdyenGateway.ts", type: "file", badge: "ts", lines: 198 },
          { id: "file-token-vault", name: "TokenVault.ts", path: "src/services/TokenVault.ts", type: "file", badge: "ts", lines: 142 }
        ]
      },
      {
        id: "folder-workers",
        name: "workers",
        path: "src/workers",
        type: "folder",
        count: 3,
        children: [
          { id: "file-batch-processor", name: "BatchProcessor.js", path: "src/workers/BatchProcessor.js", type: "file", badge: "js", lines: 135 },
          { id: "file-webhook-handler", name: "WebhookHandler.js", path: "src/workers/WebhookHandler.js", type: "file", badge: "js", lines: 110 },
          { id: "file-payment-worker", name: "PaymentWorker.js", path: "src/workers/PaymentWorker.js", type: "file", badge: "js", lines: 150 }
        ]
      }
    ]
  }
];

export const SKILL_TEXTS = {
  beginner: {
    badge: "Beginner Mode",
    badgeLong: "Beginner (Analogy Mode)",
    tag: "Beginner Analogy",
    techniquesIndicator: "Beginner Mode Active",
    overviewCard: "Analogy-focused concept: Think of this payments-backend service like a digital bank teller. Every time a customer taps 'Refund', this service checks the store's central notebook (the repository) to make sure money exists, without worrying about how the notebook is printed or stored.",
    whatItDoes: "Analogy Concept: Imagine a librarian managing book returns. When a book (refund request) arrives, this service inspects whether it's eligible for return, cancels the overdue fee, and tells the back-office warehouse to put the item back on the shelf safely.",
    filesCard: "Analogy Concept: This code acts like a receipt stamp. It checks if the receipt has a valid order number, stamps it with the current date, and hands it over to the external credit card company."
  },
  intermediate: {
    badge: "Intermediate Mode",
    badgeLong: "Intermediate (Architecture Mode)",
    tag: "Architecture Mode",
    techniquesIndicator: "Intermediate Mode Active",
    overviewCard: "Architecture & patterns: Implements transactional outbox, distributed locking via Redis Sentinel, and strict Repository Pattern decoupling. Database access is isolated into repository abstractions allowing seamless unit testing and schema evolution without controller refactoring.",
    whatItDoes: "Architecture & Patterns: Orchestrates refund lifecycle execution. Accepts normalized payment tokens, invokes Stripe/Adyen gateway RPC adapters, and commits atomic double-entry balance updates through the decoupled LedgerRepository.",
    filesCard: "Architecture Walkthrough: Implements business validation guard clauses, prepares idempotency payload headers, dispatches external gateway refund call, and commits transactional result into persistent storage."
  },
  senior: {
    badge: "Senior Mode",
    badgeLong: "Senior Architecture Mode (Expert)",
    tag: "Senior / Deep Systems",
    techniquesIndicator: "Senior Architecture Mode (Expert)",
    overviewCard: "Trade-offs & edge cases: Evaluates leaky abstraction risks in repository query boundaries, partial failures across non-distributed 2PC transactions, and AST-flagged in-place object mutations that risk memory leaks across concurrent event-loop ticks.",
    whatItDoes: "Trade-offs & Edge Cases: Leaky abstraction risk: mutating arguments in-place risks side-effects if callers retain memory pointers. Lacks distributed two-phase commit rollback if Stripe succeeds but LedgerRepository fails during network partition.",
    filesCard: "Deep Dive & AST Hazards: Line 9 mutates argument struct in-place causing cache pollution. Lacks exponential backoff retry jitter on transient HTTP 503 gateway socket closures."
  }
};
