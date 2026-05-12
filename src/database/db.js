import * as SQLite from 'expo-sqlite';

const DB_NAME = 'pos.db';

let openPromise = null;
/** Ensures CREATE + migrate + backfills run exactly once before any queries. */
let schemaPromise = null;

function openDatabase() {
  if (!openPromise) {
    openPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return openPromise;
}

async function columnNames(db, table) {
  const rows = await db.getAllAsync(`PRAGMA table_info(${table});`);
  return new Set(rows.map((r) => r.name));
}

async function migrate(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      street_address TEXT NOT NULL,
      city TEXT NOT NULL,
      shop_name TEXT,
      shop_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const products = await columnNames(db, 'products');
  if (!products.has('category')) {
    await db.execAsync(
      `ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'General';`
    );
  }
  if (!products.has('cost_price')) {
    await db.execAsync(`ALTER TABLE products ADD COLUMN cost_price REAL;`);
  }

  const saleItems = await columnNames(db, 'sale_items');
  if (!saleItems.has('product_name')) {
    await db.execAsync(`ALTER TABLE sale_items ADD COLUMN product_name TEXT;`);
  }

  const sales = await columnNames(db, 'sales');
  if (!sales.has('sale_date')) {
    await db.execAsync(`ALTER TABLE sales ADD COLUMN sale_date TEXT;`);
  }
  if (!sales.has('paid_amount')) {
    await db.execAsync(`ALTER TABLE sales ADD COLUMN paid_amount REAL;`);
  }
  if (!sales.has('change_amount')) {
    await db.execAsync(`ALTER TABLE sales ADD COLUMN change_amount REAL;`);
  }
  if (!sales.has('payment_method')) {
    await db.execAsync(
      `ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'Cash';`
    );
  }

  if (!products.has('deleted_at')) {
    await db.execAsync(`ALTER TABLE products ADD COLUMN deleted_at TEXT;`);
  }
  if (!products.has('updated_at')) {
    await db.execAsync(`ALTER TABLE products ADD COLUMN updated_at TEXT;`);
    await db.execAsync(
      `UPDATE products SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL;`
    );
  }
  if (!products.has('owner_user_id')) {
    await db.execAsync(`ALTER TABLE products ADD COLUMN owner_user_id INTEGER;`);
  }

  if (!sales.has('owner_user_id')) {
    await db.execAsync(`ALTER TABLE sales ADD COLUMN owner_user_id INTEGER;`);
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS stock_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('stock_addition','stock_edition','sale','breakage','adjustment')),
      quantity_delta INTEGER NOT NULL,
      unit_cost REAL,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_stock_events_owner_created ON stock_events (owner_user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_events_product_created ON stock_events (product_id, created_at);
  `);

  const financeTable = await db.getFirstAsync(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'finance_transactions';`
  );
  const financeSql = String(financeTable?.sql || '');
  if (
    financeSql &&
    (!financeSql.includes("'stock_purchase'") || !financeSql.includes("'stock_adjustment'"))
  ) {
    await db.execAsync(`
      ALTER TABLE finance_transactions RENAME TO finance_transactions_old;
      CREATE TABLE finance_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense','withdrawal','breakage','capital','profit','stock_purchase','stock_adjustment','capital_adjustment','stock_reversal','sale_reversal','profit_reversal')),
        amount REAL NOT NULL CHECK (amount >= 0),
        occurred_on TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        notes TEXT,
        product_id INTEGER,
        product_name TEXT,
        quantity INTEGER,
        withdrawn_by TEXT,
        capital_source TEXT,
        sale_id INTEGER,
        hidden_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO finance_transactions (
        id, owner_user_id, type, amount, occurred_on, description, notes,
        product_id, product_name, quantity, withdrawn_by, capital_source, sale_id, hidden_at, created_at
      )
      SELECT
        id, owner_user_id, type, amount, occurred_on, description, notes,
        product_id, product_name, quantity, withdrawn_by, capital_source, sale_id, NULL, created_at
      FROM finance_transactions_old;
      DROP TABLE finance_transactions_old;
      CREATE INDEX IF NOT EXISTS idx_finance_owner_date ON finance_transactions (owner_user_id, occurred_on);
      CREATE INDEX IF NOT EXISTS idx_finance_owner_type ON finance_transactions (owner_user_id, type);
    `);
  }

  const financeTable2 = await db.getFirstAsync(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'finance_transactions';`
  );
  const financeSql2 = String(financeTable2?.sql || '');
  if (financeSql2 && !financeSql2.includes("'profit_reversal'")) {
    await db.execAsync(`
      ALTER TABLE finance_transactions RENAME TO finance_transactions_old;
      CREATE TABLE finance_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('expense','withdrawal','breakage','capital','profit','stock_purchase','stock_adjustment','capital_adjustment','stock_reversal','sale_reversal','profit_reversal')),
        amount REAL NOT NULL CHECK (amount >= 0),
        occurred_on TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        notes TEXT,
        product_id INTEGER,
        product_name TEXT,
        quantity INTEGER,
        withdrawn_by TEXT,
        capital_source TEXT,
        sale_id INTEGER,
        hidden_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO finance_transactions (
        id, owner_user_id, type, amount, occurred_on, description, notes,
        product_id, product_name, quantity, withdrawn_by, capital_source, sale_id, hidden_at, created_at
      )
      SELECT
        id, owner_user_id, type, amount, occurred_on, description, notes,
        product_id, product_name, quantity, withdrawn_by, capital_source, sale_id, hidden_at, created_at
      FROM finance_transactions_old;
      DROP TABLE finance_transactions_old;
      CREATE INDEX IF NOT EXISTS idx_finance_owner_date ON finance_transactions (owner_user_id, occurred_on);
      CREATE INDEX IF NOT EXISTS idx_finance_owner_type ON finance_transactions (owner_user_id, type);
    `);
  }
}

async function runSchemaSetup(db) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER,
      name TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      category TEXT NOT NULL DEFAULT 'General',
      cost_price REAL,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      street_address TEXT NOT NULL,
      city TEXT NOT NULL,
      shop_name TEXT,
      shop_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER,
      total REAL NOT NULL CHECK (total >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sale_date TEXT,
      paid_amount REAL,
      change_amount REAL,
      payment_method TEXT NOT NULL DEFAULT 'Cash'
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      product_name TEXT,
      FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  await migrate(db);
  await db.execAsync(`
    UPDATE sales SET sale_date = COALESCE(sale_date, strftime('%Y-%m-%d', created_at))
    WHERE sale_date IS NULL;
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS finance_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('expense','withdrawal','breakage','capital','profit','stock_purchase','stock_adjustment','capital_adjustment','stock_reversal','sale_reversal','profit_reversal')),
      amount REAL NOT NULL CHECK (amount >= 0),
      occurred_on TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      notes TEXT,
      product_id INTEGER,
      product_name TEXT,
      quantity INTEGER,
      withdrawn_by TEXT,
      capital_source TEXT,
      sale_id INTEGER,
      hidden_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_finance_owner_date ON finance_transactions (owner_user_id, occurred_on);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_finance_owner_type ON finance_transactions (owner_user_id, type);`
  );
  const financeCols = await columnNames(db, 'finance_transactions');
  if (!financeCols.has('hidden_at')) {
    await db.execAsync(`ALTER TABLE finance_transactions ADD COLUMN hidden_at TEXT;`);
  }
  const salesCols = await columnNames(db, 'sales');
  if (!salesCols.has('reversed_total')) {
    await db.execAsync(`ALTER TABLE sales ADD COLUMN reversed_total REAL NOT NULL DEFAULT 0;`);
  }
  const saleItemsCols = await columnNames(db, 'sale_items');
  if (!saleItemsCols.has('reversed_quantity')) {
    await db.execAsync(`ALTER TABLE sale_items ADD COLUMN reversed_quantity INTEGER NOT NULL DEFAULT 0;`);
  }
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS stock_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('stock_addition','stock_edition','sale','breakage','adjustment')),
      quantity_delta INTEGER NOT NULL,
      unit_cost REAL,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_stock_events_owner_created ON stock_events (owner_user_id, created_at);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_stock_events_product_created ON stock_events (product_id, created_at);`
  );
}

/**
 * Returns a DB handle only after tables and migrations are ready.
 * All services should use this (never assume CartContext ran init first).
 */
export async function getDb() {
  const db = await openDatabase();
  if (!schemaPromise) {
    schemaPromise = runSchemaSetup(db).catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  await schemaPromise;
  return db;
}

/** Same as awaiting getDb(); kept for CartProvider startup / error UX. */
export async function initDatabase() {
  return getDb();
}
