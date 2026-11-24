"use strict";

/*
 * pricing.js — чистая (без БД) логика расчёта строки корзины.
 * Деньги считаем в копейках (целые числа), чтобы не ловить 0.1+0.2.
 */

class CartLineError extends Error {
  constructor(message) {
    super(message);
    this.name = "CartLineError";
  }
}

const MAX_QTY = 100;
const MAX_MODIFIERS = 30;

const toCents = value => Math.round(Number(value) * 100);
const fromCents = cents => cents / 100;

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

/*
 * entry: { product:{id,name,price,isActive}, variants:[{id,name,price,isActive}],
 *          groups:[{id,name,minSelect,maxSelect,isActive,options:[{id,name,price,isActive}]}] }
 * line:  { id, quantity, variantId?, modifierIds? }
 */
function priceCartLine(entry, line) {
  const product = entry && entry.product;

  if (!product || !product.isActive) {
    throw new CartLineError("Один из товаров больше недоступен.");
  }

  const quantity = Number(line.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
    throw new CartLineError(`Некорректное количество для «${product.name}».`);
  }

  // ---------- размер ----------
  const variants = (entry.variants || []).filter(v => v.isActive);
  let variant = null;
  let baseCents;

  if (variants.length > 0) {
    if (line.variantId === undefined || line.variantId === null || line.variantId === "") {
      if (variants.length === 1) {
        variant = variants[0]; // единственный размер выбираем автоматически
      } else {
        throw new CartLineError(`Выберите размер для «${product.name}».`);
      }
    } else {
      const vid = Number(line.variantId);
      variant = variants.find(v => v.id === vid);
      if (!variant) {
        throw new CartLineError(`Выбранный размер для «${product.name}» недоступен.`);
      }
    }
    baseCents = toCents(variant.price);
  } else {
    if (line.variantId !== undefined && line.variantId !== null && line.variantId !== "") {
      throw new CartLineError(`У «${product.name}» нет вариантов размера.`);
    }
    baseCents = toCents(product.price);
  }

  // ---------- модификаторы ----------
  const rawIds = Array.isArray(line.modifierIds) ? line.modifierIds : [];
  if (rawIds.length > MAX_MODIFIERS) {
    throw new CartLineError("Слишком много добавок.");
  }

  const ids = rawIds.map(Number);
  if (!ids.every(isPositiveInt)) {
    throw new CartLineError("Некорректные добавки.");
  }
  if (new Set(ids).size !== ids.length) {
    throw new CartLineError("Добавки не должны повторяться.");
  }

  const groups = (entry.groups || []).filter(g => g.isActive);
  const optionIndex = new Map(); // optionId -> {group, option}
  for (const group of groups) {
    for (const option of group.options || []) {
      if (option.isActive) optionIndex.set(option.id, { group, option });
    }
  }

  const perGroup = new Map();
  const chosen = [];

  for (const id of ids) {
    const hit = optionIndex.get(id);
    if (!hit) {
      throw new CartLineError(`Добавка недоступна для «${product.name}».`);
    }
    perGroup.set(hit.group.id, (perGroup.get(hit.group.id) || 0) + 1);
    chosen.push({
      id: hit.option.id,
      groupId: hit.group.id,
      group: hit.group.name,
      name: hit.option.name,
      price: fromCents(toCents(hit.option.price))
    });
  }

  for (const group of groups) {
    const activeCount = (group.options || []).filter(o => o.isActive).length;
    const min = Math.min(group.minSelect, activeCount);
    const count = perGroup.get(group.id) || 0;

    if (count < min) {
      throw new CartLineError(`«${group.name}»: выберите минимум ${min} для «${product.name}».`);
    }
    if (count > group.maxSelect) {
      throw new CartLineError(`«${group.name}»: можно выбрать не более ${group.maxSelect}.`);
    }
  }

  const unitCents = baseCents + chosen.reduce((s, o) => s + toCents(o.price), 0);

  return {
    productId: product.id,
    productName: product.name,
    variantId: variant ? variant.id : null,
    variantName: variant ? variant.name : null,
    options: chosen,
    unitPrice: fromCents(unitCents),
    quantity,
    lineTotal: fromCents(unitCents * quantity)
  };
}

function priceCart(items, products, optionsByProduct) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CartLineError("Корзина пуста.");
  }

  const lines = items.map(item => {
    const productId = Number(item.id);
    const product = products.get(productId);
    if (!product) throw new CartLineError("Один из товаров не найден.");

    const opts = optionsByProduct.get(productId) || { variants: [], groups: [] };
    return priceCartLine({ product, variants: opts.variants, groups: opts.groups }, item);
  });

  const subtotalCents = lines.reduce((s, l) => s + toCents(l.lineTotal), 0);
  return { lines, subtotal: fromCents(subtotalCents) };
}

module.exports = { CartLineError, priceCartLine, priceCart, toCents, fromCents };
