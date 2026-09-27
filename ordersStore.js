"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                       ORDERSSTORE.JS                          ║
║   Сохранение заказов (orders) и их состава (order_items).     ║
║   Используется server.js внутри транзакции /api/checkout.     ║
╚══════════════════════════════════════════════════════════════╝

Обе функции здесь принимают client — это pg-клиент уже открытой
транзакции чекаута (см. db.getClient() в server.js), а не пул.
Так вставка заказа, списание промокода и списание пересчитанных
цен товаров происходят как одно атомарное целое: либо всё
записалось, либо (при ошибке) ничего не записалось.
*/

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/*
 * Создаёт запись в orders, возвращает её id.
 */
async function insertOrder(client, {
  customerName,
  customerPhone,
  deliveryType,
  address,
  totalAmount,
  discountAmount,
  promocodeUsed
}) {
  const result = await client.query(
    `INSERT INTO orders
       (customer_name, customer_phone, delivery_type, address,
        total_amount, discount_amount, promocode_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      customerName,
      customerPhone,
      deliveryType,
      address || null,
      toNumber(totalAmount),
      toNumber(discountAmount, 0),
      promocodeUsed || null
    ]
  );

  return result.rows[0]; // { id, created_at }
}

/*
 * Записывает состав заказа (order_items) одним запросом
 * (multi-row INSERT) вместо цикла с отдельными INSERT'ами —
 * меньше round-trip'ов к БД.
 *
 * items: [{ productId, productName, unitPrice, quantity }]
 */
async function insertOrderItems(client, orderId, items) {
  if (!items.length) {
    return;
  }

  const values = [];
  const placeholders = items.map((item, index) => {
    const base = index * 5;

    values.push(
      orderId,
      item.productId ?? null,
      item.productName,
      toNumber(item.unitPrice),
      Number(item.quantity)
    );

    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  await client.query(
    `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
     VALUES ${placeholders.join(", ")}`,
    values
  );
}

/*
 * Заказ целиком (для будущей админки / истории заказов) —
 * не используется в текущем ТЗ напрямую, но пригодится.
 */
async function findOrderById(db, id) {
  const orderResult = await db.query("SELECT * FROM orders WHERE id = $1", [id]);

  if (!orderResult.rows[0]) {
    return null;
  }

  const itemsResult = await db.query(
    "SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC",
    [id]
  );

  return {
    ...orderResult.rows[0],
    items: itemsResult.rows
  };
}

module.exports = {
  insertOrder,
  insertOrderItems,
  findOrderById
};
