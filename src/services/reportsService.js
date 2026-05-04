import { getDb } from '../database/db';

/**
 * @param {string} startYmd YYYY-MM-DD inclusive
 * @param {string} endYmd YYYY-MM-DD inclusive
 */
export async function getSalesInDateRange(userId, startYmd, endYmd) {
  if (!userId) throw new Error('User session is required.');
  const db = await getDb();
  return db.getAllAsync(
    `SELECT
       s.id,
       s.total,
       s.created_at,
       s.sale_date,
       s.paid_amount,
       s.change_amount,
       s.payment_method,
       COALESCE(
         SUM(CASE WHEN p.cost_price IS NOT NULL THEN si.quantity * (si.unit_price - p.cost_price) ELSE 0 END),
         0
       ) AS estimated_profit,
       COALESCE(
         SUM(CASE WHEN p.cost_price IS NOT NULL THEN si.quantity * si.unit_price ELSE 0 END),
         0
       ) AS tracked_revenue
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     LEFT JOIN products p ON p.id = si.product_id AND p.owner_user_id = s.owner_user_id
     WHERE s.owner_user_id = ?
       AND s.sale_date IS NOT NULL
       AND s.sale_date >= ?
       AND s.sale_date <= ?
     GROUP BY s.id
     ORDER BY datetime(s.created_at) DESC, s.id DESC;`,
    [userId, startYmd, endYmd]
  );
}

export async function getSaleLines(userId, saleId) {
  if (!userId) throw new Error('User session is required.');
  const db = await getDb();
  return db.getAllAsync(
    `SELECT
       COALESCE(NULLIF(TRIM(product_name), ''), 'Item') AS name,
       quantity AS quantity,
       unit_price AS unitPrice,
       (quantity * unit_price) AS lineTotal
     FROM sale_items
     WHERE sale_id IN (SELECT id FROM sales WHERE id = ? AND owner_user_id = ?)
     ORDER BY id ASC;`,
    [saleId, userId]
  );
}

export async function getSaleHeader(userId, saleId) {
  if (!userId) throw new Error('User session is required.');
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT id, total, created_at, paid_amount, change_amount, payment_method
     FROM sales WHERE id = ? AND owner_user_id = ?;`,
    [saleId, userId]
  );
}

export async function getRangeSummary(userId, startYmd, endYmd) {
  if (!userId) throw new Error('User session is required.');
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT
       COUNT(DISTINCT s.id) AS sales_count,
       COALESCE(SUM(s.total), 0) AS total_revenue,
       COALESCE(
         SUM(CASE WHEN p.cost_price IS NOT NULL THEN si.quantity * si.unit_price ELSE 0 END),
         0
       ) AS tracked_revenue,
       COALESCE(
         SUM(CASE WHEN p.cost_price IS NOT NULL THEN si.quantity * p.cost_price ELSE 0 END),
         0
       ) AS total_cost,
       COALESCE(
         SUM(CASE WHEN p.cost_price IS NOT NULL THEN si.quantity * (si.unit_price - p.cost_price) ELSE 0 END),
         0
       ) AS total_profit
     FROM sales s
     LEFT JOIN sale_items si ON si.sale_id = s.id
     LEFT JOIN products p ON p.id = si.product_id AND p.owner_user_id = s.owner_user_id
     WHERE s.owner_user_id = ?
       AND s.sale_date IS NOT NULL
       AND s.sale_date >= ?
       AND s.sale_date <= ?;`,
    [userId, startYmd, endYmd]
  );

  const totalRevenue = Number(row?.total_revenue || 0);
  const trackedRevenue = Number(row?.tracked_revenue || 0);
  const totalCost = Number(row?.total_cost || 0);
  const totalProfit = Number(row?.total_profit || 0);
  const salesCount = Number(row?.sales_count || 0);
  return {
    salesCount,
    totalRevenue,
    trackedRevenue,
    untrackedRevenue: Math.max(0, totalRevenue - trackedRevenue),
    totalCost,
    totalProfit,
    avgSale: salesCount > 0 ? totalRevenue / salesCount : 0,
  };
}

/**
 * Per-product report over a date range.
 * - salesCount: number of distinct sales containing product
 * - soldQty: total quantity sold
 * - remainingStock: current inventory stock
 * - salesBalance: total revenue collected for this product in range
 * - profit: derived from line unit_price minus product cost_price when available
 */
export async function getProductPerformance(userId, startYmd, endYmd) {
  if (!userId) throw new Error('User session is required.');
  const db = await getDb();
  return db.getAllAsync(
    `SELECT
       p.id AS productId,
       p.name AS productName,
       p.category AS category,
       p.stock AS remainingStock,
       p.cost_price AS costPrice,
       COALESCE(COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN s.id END), 0) AS salesCount,
       COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN si.quantity ELSE 0 END), 0) AS soldQty,
       COALESCE(
         SUM(CASE WHEN s.id IS NOT NULL THEN si.quantity * si.unit_price ELSE 0 END), 0
       ) AS salesBalance,
       COALESCE(
         ROUND(
           SUM(CASE WHEN s.id IS NOT NULL THEN si.quantity * si.unit_price ELSE 0 END)
           / NULLIF(SUM(CASE WHEN s.id IS NOT NULL THEN si.quantity ELSE 0 END), 0),
           2
         ),
         0
       ) AS pricePerItem,
       COALESCE(
         SUM(
           CASE WHEN p.cost_price IS NOT NULL AND s.id IS NOT NULL
             THEN si.quantity * (si.unit_price - p.cost_price)
             ELSE 0
           END
         ),
         0
       ) AS profit
     FROM products p
     LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales s
       ON s.id = si.sale_id
      AND s.owner_user_id = p.owner_user_id
      AND s.sale_date IS NOT NULL
      AND s.sale_date >= ?
      AND s.sale_date <= ?
     WHERE p.owner_user_id = ?
     GROUP BY p.id
     HAVING COALESCE(SUM(CASE WHEN s.id IS NOT NULL THEN si.quantity ELSE 0 END), 0) > 0
     ORDER BY salesBalance DESC, productName COLLATE NOCASE ASC;`,
    [startYmd, endYmd, userId]
  );
}

export async function getDailySalesSeries(userId, startYmd, endYmd) {
  if (!userId) throw new Error('User session is required.');
  const db = await getDb();
  return db.getAllAsync(
    `SELECT
       s.sale_date AS day,
       COALESCE(SUM(s.total), 0) AS totalSales
     FROM sales s
     WHERE s.owner_user_id = ?
       AND s.sale_date IS NOT NULL
       AND s.sale_date >= ?
       AND s.sale_date <= ?
     GROUP BY s.sale_date
     ORDER BY s.sale_date ASC;`,
    [userId, startYmd, endYmd]
  );
}

export async function getLowStockAlertsCount(userId, threshold = 5) {
  if (!userId) throw new Error('User session is required.');
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS count
     FROM products
     WHERE owner_user_id = ?
       AND deleted_at IS NULL
       AND stock <= ?;`,
    [userId, threshold]
  );
  return Number(row?.count || 0);
}
