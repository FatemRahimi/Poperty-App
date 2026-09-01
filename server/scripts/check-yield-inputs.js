require('dotenv').config();
const pool = require('../models/db');
const { getMonthlyRent } = require('../services/ai/propertyDataAggregator');

(async () => {
  const r = await pool.query(
    `SELECT id, title, category, price, monthly_rent, weekly_rent, city, bedrooms
     FROM properties
     WHERE REPLACE(UPPER(COALESCE(zip_code,'')),' ','') = 'B192YF'
       AND status = 'approved'
     LIMIT 8`
  );
  console.log('B192YF listings — yield inputs:\n');
  r.rows.forEach((p) => {
    const rent = getMonthlyRent(p);
    const price = Number(p.price) || 0;
    const canYield = price > 0 && rent > 0;
    console.log({
      id: p.id,
      category: p.category,
      price: p.price,
      monthly_rent: p.monthly_rent,
      weekly_rent: p.weekly_rent,
      computedMonthlyRent: rent,
      canCalculateYield: canYield,
      blockReason:
        !canYield && price <= 0
          ? 'NO_PURCHASE_PRICE (rent-only listing)'
          : !canYield && rent <= 0
            ? 'NO_RENT'
            : null,
    });
  });
  await pool.end();
})();
