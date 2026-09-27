"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                       PROMOSTORE.JS                           ║
║   Репозиторий промокодов (таблица promocodes, PostgreSQL).    ║
║   Используется server.js (чекаут, /api/validate-coupon)       ║
║   и Telegram-ботом управления промокодами (promoBot.js).      ║
╚══════════════════════════════════════════════════════════════╝

История:

Раньше промокоды хранились в promocodes.json на диске
(см. предыдущую версию файла в истории проекта). Теперь —
в таблице promocodes в PostgreSQL. Публичный набор функций
(normalizePromoCode, listPromoCodes, findPromoCode, addPromoCode,
deletePromoCode, updatePromoCode, setPromoActive) специально
оставлен таким же по форме, каким пользовался promoBot.js —
поэтому сам бот почти не пришлось менять.

Новое, чего не было в файловой версии:

- previewPromo(code, subtotal)     — только проверка, без списания
  (используется в /api/validate-coupon, когда клиент вводит промокод
  в корзине, а заказ ещё не оформлен).

- consumePromoInTransaction(client, code, subtotal) — проверка
  С БЛОКИРОВКОЙ СТРОКИ (SELECT ... FOR UPDATE) и списанием
  использования внутри уже открытой транзакции чекаута
  (см. /api/checkout в server.js). Это защищает от гонки:
  если два человека одновременно применяют промокод с лимитом
  "1 использование", применить его успеет только один.

ВАЖНО — чего лишились при переходе на схему из ТЗ:

В файловой версии у промокода были startsAt/expiresAt (срок
действия). В таблице promocodes из текущего ТЗ таких колонок
нет — поэтому проверка срока действия здесь отсутствует.
Если она нужна — добавь в schema.sql:

  ALTER TABLE promocodes ADD COLUMN starts_at TIMESTAMP;
  ALTER TABLE promocodes ADD COLUMN expires_at TIMESTAMP;

и верни соответствующие проверки сюда (они закомментированы
ниже, в previewPromo/consumePromoInTransaction, как ORIENTIR).
*/

const db = require("./db");

/* ============================================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ============================================================ */

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizePromoCode(code) {
  return String(code || "").trim().toUpperCase();
}

/*
 * Приводим строку БД (snake_case, NUMERIC как строка)
 * к тому же camelCase-объекту, каким раньше был promo
 * из promocodes.json — чтобы promoBot.js не пришлось
 * переписывать форматирование.
 */
function mapPromoRow(row) {
  return {
    id: row.id,
    code: row.code,
    type: row.discount_type, // 'percent' | 'fixed'
    value: toNumber(row.discount_value),
    active: row.is_active,
    minOrderAmount: toNumber(row.min_order_amount),
    maxUses: row.usage_limit === null ? null : Number(row.usage_limit),
    usedCount: toNumber(row.times_used)
  };
}

/* ============================================================
   ЧТЕНИЕ
   ============================================================ */

async function listPromoCodes() {
  const result = await db.query(
    "SELECT * FROM promocodes ORDER BY id ASC"
  );

  return result.rows.map(mapPromoRow);
}

// Оставлен как алиас — так называлась функция в файловой версии.
const loadPromoCodes = listPromoCodes;

async function findPromoCode(code) {
  const normalizedCode = normalizePromoCode(code);

  const result = await db.query(
    "SELECT * FROM promocodes WHERE code = $1",
    [normalizedCode]
  );

  return result.rows[0] ? mapPromoRow(result.rows[0]) : null;
}

/* ============================================================
   СОЗДАНИЕ / ИЗМЕНЕНИЕ / УДАЛЕНИЕ
   ============================================================ */

async function addPromoCode(data) {
  const code = normalizePromoCode(data.code);

  if (!code) {
    return { success: false, reason: "Код промокода не может быть пустым." };
  }

  if (!["percent", "fixed"].includes(data.type)) {
    return { success: false, reason: "Тип промокода должен быть 'percent' или 'fixed'." };
  }

  const value = toNumber(data.value, NaN);

  if (!Number.isFinite(value) || value <= 0) {
    return { success: false, reason: "Некорректное значение скидки." };
  }

  if (data.type === "percent" && value > 100) {
    return { success: false, reason: "Процент скидки не может быть больше 100." };
  }

  try {
    const result = await db.query(
      `INSERT INTO promocodes
         (code, discount_type, discount_value, min_order_amount, usage_limit, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        code,
        data.type,
        value,
        toNumber(data.minOrderAmount, 0),
        data.maxUses === null || data.maxUses === undefined ? null : toNumber(data.maxUses, null),
        data.active !== false
      ]
    );

    return { success: true, promo: mapPromoRow(result.rows[0]) };
  } catch (error) {
    if (error.code === "23505") {
      // unique_violation
      return { success: false, reason: `Промокод ${code} уже существует.` };
    }

    throw error;
  }
}

async function deletePromoCode(code) {
  const normalizedCode = normalizePromoCode(code);

  const result = await db.query(
    "DELETE FROM promocodes WHERE code = $1 RETURNING *",
    [normalizedCode]
  );

  if (result.rowCount === 0) {
    return { success: false, reason: "Промокод не найден." };
  }

  return { success: true, promo: mapPromoRow(result.rows[0]) };
}

async function updatePromoCode(code, patch) {
  const existing = await findPromoCode(code);

  if (!existing) {
    return { success: false, reason: "Промокод не найден." };
  }

  const merged = { ...existing, ...patch };

  const result = await db.query(
    `UPDATE promocodes
     SET discount_type = $1, discount_value = $2, min_order_amount = $3,
         usage_limit = $4, is_active = $5
     WHERE id = $6
     RETURNING *`,
    [
      merged.type,
      toNumber(merged.value),
      toNumber(merged.minOrderAmount),
      merged.maxUses === null || merged.maxUses === undefined ? null : toNumber(merged.maxUses),
      merged.active !== false,
      existing.id
    ]
  );

  return { success: true, promo: mapPromoRow(result.rows[0]) };
}

async function setPromoActive(code, active) {
  return updatePromoCode(code, { active: Boolean(active) });
}

/* ============================================================
   РАСЧЁТ СКИДКИ (общая логика для preview и checkout)
   ============================================================ */

function computeDiscount(promo, subtotal) {
  let discount = 0;

  if (promo.type === "percent") {
    const percent = clamp(promo.value, 0, 100);
    discount = (subtotal * percent) / 100;
  } else {
    discount = promo.value;
  }

  return clamp(discount, 0, subtotal);
}

function checkPromoRules(promo, subtotal) {
  if (!promo) {
    return { valid: false, reason: "Промокод не найден." };
  }

  if (promo.active !== true) {
    return { valid: false, reason: "Промокод больше не активен." };
  }

  // ORIENTIR: если добавишь starts_at/expires_at в схему — проверки сюда.
  // if (promo.startsAt && new Date() < new Date(promo.startsAt)) { ... }
  // if (promo.expiresAt && new Date() > new Date(promo.expiresAt)) { ... }

  if (subtotal < promo.minOrderAmount) {
    return {
      valid: false,
      reason: `Минимальная сумма заказа для этого промокода — ${promo.minOrderAmount}₽.`
    };
  }

  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    return { valid: false, reason: "Лимит использования промокода исчерпан." };
  }

  return { valid: true };
}

/* ============================================================
   PREVIEW — проверка без списания (для /api/validate-coupon)
   ============================================================ */

async function previewPromo(code, subtotal) {
  const normalizedCode = normalizePromoCode(code);
  const orderSubtotal = toNumber(subtotal);

  if (!normalizedCode) {
    return { valid: false, reason: "Введите промокод." };
  }

  if (orderSubtotal <= 0) {
    return { valid: false, reason: "Сумма заказа должна быть больше нуля." };
  }

  const promo = await findPromoCode(normalizedCode);
  const rules = checkPromoRules(promo, orderSubtotal);

  if (!rules.valid) {
    return rules;
  }

  const discount = computeDiscount(promo, orderSubtotal);

  return {
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    discount,
    subtotal: orderSubtotal,
    total: Math.max(0, orderSubtotal - discount)
  };
}

/* ============================================================
   CONSUME — проверка + списание внутри транзакции чекаута
   ============================================================ */

/*
 * client — это pg-клиент из уже открытой транзакции чекаута
 * (db.getClient() + client.query("BEGIN") в server.js).
 *
 * SELECT ... FOR UPDATE блокирует строку промокода до конца
 * транзакции — если два заказа одновременно пытаются
 * использовать промокод с usage_limit = 1, второй запрос
 * подождёт, увидит уже увеличенный times_used и получит отказ,
 * вместо того чтобы оба "проскочили" лимит.
 */
async function consumePromoInTransaction(client, code, subtotal) {
  const normalizedCode = normalizePromoCode(code);
  const orderSubtotal = toNumber(subtotal);

  if (!normalizedCode) {
    return { valid: false, reason: "Введите промокод." };
  }

  const result = await client.query(
    "SELECT * FROM promocodes WHERE code = $1 FOR UPDATE",
    [normalizedCode]
  );

  const promo = result.rows[0] ? mapPromoRow(result.rows[0]) : null;
  const rules = checkPromoRules(promo, orderSubtotal);

  if (!rules.valid) {
    return rules;
  }

  const discount = computeDiscount(promo, orderSubtotal);

  await client.query(
    "UPDATE promocodes SET times_used = times_used + 1 WHERE id = $1",
    [promo.id]
  );

  return {
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    discount,
    subtotal: orderSubtotal,
    total: Math.max(0, orderSubtotal - discount)
  };
}

module.exports = {
  normalizePromoCode,
  loadPromoCodes,
  listPromoCodes,
  findPromoCode,
  addPromoCode,
  deletePromoCode,
  updatePromoCode,
  setPromoActive,
  previewPromo,
  consumePromoInTransaction
};
