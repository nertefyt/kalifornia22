"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                       MENUSTORE.JS                            ║
║   Репозиторий категорий и товаров (таблицы categories,        ║
║   products). Используется server.js (GET /api/menu, checkout) ║
║   и Telegram-ботом (управление товарами/категориями).         ║
╚══════════════════════════════════════════════════════════════╝
*/

const db = require("./db");

/* ============================================================
   ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ============================================================ */

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/*
 * PostgreSQL возвращает NUMERIC как строку (чтобы не терять точность) —
 * приводим к числу на границе приложения.
 */
function mapProductRow(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    price: toNumber(row.price),
    imageUrl: row.image_url,
    isActive: row.is_active
  };
}

function mapCategoryRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order
  };
}

/* ============================================================
   КАТЕГОРИИ
   ============================================================ */

async function listCategories() {
  const result = await db.query(
    "SELECT id, name, slug, sort_order FROM categories ORDER BY sort_order ASC, id ASC"
  );

  return result.rows.map(mapCategoryRow);
}

async function findCategoryBySlug(slug) {
  const result = await db.query(
    "SELECT id, name, slug, sort_order FROM categories WHERE slug = $1",
    [String(slug || "").trim().toLowerCase()]
  );

  return result.rows[0] ? mapCategoryRow(result.rows[0]) : null;
}

async function addCategory({ name, slug, sortOrder }) {
  const cleanName = String(name || "").trim();
  const cleanSlug = String(slug || "").trim().toLowerCase();

  if (!cleanName) {
    return { success: false, reason: "Название категории не может быть пустым." };
  }

  if (!cleanSlug) {
    return { success: false, reason: "slug категории не может быть пустым." };
  }

  try {
    const result = await db.query(
      `INSERT INTO categories (name, slug, sort_order)
       VALUES ($1, $2, $3)
         RETURNING id, name, slug, sort_order`,
      [cleanName, cleanSlug, toNumber(sortOrder, 0)]
    );

    return { success: true, category: mapCategoryRow(result.rows[0]) };
  } catch (error) {
    if (error.code === "23505") {
      // unique_violation (slug уже занят)
      return { success: false, reason: `Категория со slug "${cleanSlug}" уже существует.` };
    }

    throw error;
  }
}

async function deleteCategory(id) {
  const result = await db.query(
    "DELETE FROM categories WHERE id = $1 RETURNING id",
    [id]
  );

  if (result.rowCount === 0) {
    return { success: false, reason: "Категория не найдена." };
  }

  return { success: true };
}

/* ============================================================
   ТОВАРЫ
   ============================================================ */

/*
 * Меню для сайта: категории + их активные товары.
 *
 * Возвращает массив категорий, у каждой — поле products
 * с активными товарами этой категории.
 */
async function getMenu() {
  const categories = await listCategories();

  const productsResult = await db.query(
    `SELECT id, category_id, name, description, price, image_url, is_active
     FROM products
     WHERE is_active = true
     ORDER BY category_id ASC, id ASC`
  );

  const products = productsResult.rows.map(mapProductRow);

  return categories.map(category => ({
    ...category,
    products: products.filter(product => product.categoryId === category.id)
  }));
}

async function listProducts({ onlyActive = false } = {}) {
  const whereClause = onlyActive ? "WHERE is_active = true" : "";

  const result = await db.query(
    `SELECT id, category_id, name, description, price, image_url, is_active
     FROM products
            ${whereClause}
     ORDER BY id ASC`
  );

  return result.rows.map(mapProductRow);
}

async function findProductById(id) {
  const result = await db.query(
    `SELECT id, category_id, name, description, price, image_url, is_active
     FROM products
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ? mapProductRow(result.rows[0]) : null;
}

/*
 * Получить несколько товаров по массиву id одним запросом —
 * именно эта функция используется в /api/checkout, чтобы
 * взять ЧЕСТНЫЕ цены с сервера, а не от клиента.
 *
 * executor — необязательный pg-клиент уже открытой транзакции
 * (db.getClient()). Если не передан — используется обычный пул.
 * Внутри транзакции чекаута важно передавать именно client,
 * а не пул: тогда чтение цен, списание промокода и вставка
 * заказа видят согласованное состояние БД и живут в одном
 * BEGIN/COMMIT.
 *
 * Возвращает Map<id, product> для удобного поиска.
 */
async function findProductsByIds(ids, executor = db) {
  const numericIds = ids
    .map(id => Number(id))
    .filter(id => Number.isInteger(id));

  if (numericIds.length === 0) {
    return new Map();
  }

  const result = await executor.query(
    `SELECT id, category_id, name, description, price, image_url, is_active
     FROM products
     WHERE id = ANY($1::int[])`,
    [numericIds]
  );

  const map = new Map();

  for (const row of result.rows) {
    const product = mapProductRow(row);
    map.set(product.id, product);
  }

  return map;
}

async function addProduct({ categoryId, name, description, price, imageUrl, isActive }) {
  const cleanName = String(name || "").trim();
  const cleanPrice = toNumber(price, NaN);

  if (!cleanName) {
    return { success: false, reason: "Название товара не может быть пустым." };
  }

  if (!Number.isFinite(cleanPrice) || cleanPrice < 0) {
    return { success: false, reason: "Некорректная цена товара." };
  }

  /*
   * Раньше здесь не было никакой проверки на дубликат — товар
   * с одинаковым названием в одной категории можно было создать
   * сколько угодно раз (через /product_add в боте, повторный
   * seed.js с другими id категорий и т.п.), и в БД копились
   * дубли. Явная проверка здесь — самое надёжное место: через неё
   * идут все способы добавления товара (бот, seed.js, будущая
   * admin-панель), а не только один из них.
   */
  const existing = await db.query(
    `SELECT id FROM products
     WHERE name = $1
       AND category_id IS NOT DISTINCT FROM $2`,
    [cleanName, categoryId || null]
  );

  if (existing.rows.length > 0) {
    return {
      success: false,
      reason: `Товар "${cleanName}" уже существует в этой категории (id ${existing.rows[0].id}).`
    };
  }

  const result = await db.query(
    `INSERT INTO products (category_id, name, description, price, image_url, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, category_id, name, description, price, image_url, is_active`,
    [
      categoryId || null,
      cleanName,
      description || null,
      cleanPrice,
      imageUrl || null,
      isActive !== false
    ]
  );

  return { success: true, product: mapProductRow(result.rows[0]) };
}

async function updateProduct(id, patch) {
  const existing = await findProductById(id);

  if (!existing) {
    return { success: false, reason: "Товар не найден." };
  }

  const merged = { ...existing, ...patch };

  const result = await db.query(
    `UPDATE products
     SET category_id = $1, name = $2, description = $3,
         price = $4, image_url = $5, is_active = $6
     WHERE id = $7
       RETURNING id, category_id, name, description, price, image_url, is_active`,
    [
      merged.categoryId || null,
      merged.name,
      merged.description || null,
      toNumber(merged.price),
      merged.imageUrl || null,
      merged.isActive !== false,
      id
    ]
  );

  return { success: true, product: mapProductRow(result.rows[0]) };
}

async function setProductActive(id, isActive) {
  return updateProduct(id, { isActive: Boolean(isActive) });
}

async function deleteProduct(id) {
  const result = await db.query(
    "DELETE FROM products WHERE id = $1 RETURNING id",
    [id]
  );

  if (result.rowCount === 0) {
    return { success: false, reason: "Товар не найден." };
  }

  return { success: true };
}

module.exports = {
  listCategories,
  findCategoryBySlug,
  addCategory,
  deleteCategory,

  getMenu,
  listProducts,
  findProductById,
  findProductsByIds,
  addProduct,
  updateProduct,
  setProductActive,
  deleteProduct
};
