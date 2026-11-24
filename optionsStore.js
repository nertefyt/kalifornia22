"use strict";

const db = require("./db");
const menuStore = require("./menuStore");
const { priceCart } = require("./pricing");

/* Загрузка вариантов и групп модификаторов одним пакетом (2 запроса, без N+1). */
async function loadOptionsForProducts(ids, executor = db) {
  const result = new Map();
  const numericIds = [...new Set(ids.map(Number).filter(Number.isInteger))];

  for (const id of numericIds) result.set(id, { variants: [], groups: [] });
  if (numericIds.length === 0) return result;

  // Запросы последовательные: pg-клиент внутри транзакции не любит параллель.
  const variantsRes = await executor.query(
    `SELECT id, product_id, name, price, weight, is_active
     FROM product_variants
     WHERE product_id = ANY($1::int[])
     ORDER BY sort_order, id`,
    [numericIds]
  );

  for (const r of variantsRes.rows) {
    result.get(r.product_id).variants.push({
      id: r.id, name: r.name, price: Number(r.price), weight: r.weight, isActive: r.is_active
    });
  }

  const groupsRes = await executor.query(
    `SELECT pmg.product_id, g.id AS group_id, g.name AS group_name, g.min_select, g.max_select,
            g.is_active AS group_active,
            m.id AS mod_id, m.name AS mod_name, m.price AS mod_price, m.is_active AS mod_active
     FROM product_modifier_groups pmg
     JOIN modifier_groups g ON g.id = pmg.group_id
     LEFT JOIN modifiers m ON m.group_id = g.id
     WHERE pmg.product_id = ANY($1::int[])
     ORDER BY pmg.sort_order, g.id, m.sort_order, m.id`,
    [numericIds]
  );

  const groupIndex = new Map();
  for (const r of groupsRes.rows) {
    const key = `${r.product_id}:${r.group_id}`;
    let group = groupIndex.get(key);
    if (!group) {
      group = {
        id: r.group_id, name: r.group_name,
        minSelect: r.min_select, maxSelect: r.max_select,
        isActive: r.group_active, options: []
      };
      groupIndex.set(key, group);
      result.get(r.product_id).groups.push(group);
    }
    if (r.mod_id) {
      group.options.push({ id: r.mod_id, name: r.mod_name, price: Number(r.mod_price), isActive: r.mod_active });
    }
  }

  return result;
}

/* Публичное представление для /api/menu (только активное). */
function toPublicOptions(entry, basePrice) {
  const variants = (entry?.variants || []).filter(v => v.isActive);
  const groups = (entry?.groups || [])
    .filter(g => g.isActive)
    .map(g => ({
      id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect,
      required: g.minSelect > 0,
      options: g.options.filter(o => o.isActive).map(o => ({ id: o.id, name: o.name, price: o.price }))
    }))
    .filter(g => g.options.length > 0);

  const price = variants.length ? Math.min(...variants.map(v => v.price)) : basePrice;

  return {
    price,
    variants: variants.map(v => ({ id: v.id, name: v.name, price: v.price, weight: v.weight })),
    modifierGroups: groups
  };
}

async function attachOptions(products, executor = db) {
  const map = await loadOptionsForProducts(products.map(p => p.id), executor);
  return products.map(p => ({ ...p, ...toPublicOptions(map.get(p.id), p.price) }));
}

/* Серверный расчёт корзины: клиент присылает только id/qty/variantId/modifierIds. */
async function priceCartItems(items, executor = db) {
  const ids = (Array.isArray(items) ? items : []).map(i => Number(i.id));
  const products = await menuStore.findProductsByIds(ids, executor);
  const options = await loadOptionsForProducts(ids, executor);
  return priceCart(items, products, options);
}

module.exports = { loadOptionsForProducts, toPublicOptions, attachOptions, priceCartItems };
