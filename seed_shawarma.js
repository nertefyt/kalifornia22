"use strict";

/*
 * seed_shawarma.js — добавляет категорию «Шаурма» с размерами и соусами.
 * Запуск:  node seed_shawarma.js
 *
 * Безопасно запускать повторно: ничего не удаляет и не дублирует,
 * существующие размеры/соусы обновляет (цена, вес), недостающие добавляет.
 * В отличие от `npm run seed`, НЕ стирает таблицы.
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");

const db = require("./db");
const menuStore = require("./menuStore");

/*
 * Картинки: кладём оригиналы (png/jpg/jpeg) в папку img/ под именем
 * из `image` ниже (без расширения), затем запускаем `node optimize_images.js`
 * — он создаст рядом лёгкие .webp. В БД пишем адрес ОРИГИНАЛА: сервер сам
 * отдаст .webp тем браузерам, которые его поддерживают.
 */
const IMAGES_DIR = path.join(__dirname, "img");

function resolveImageUrl(baseName) {
  for (const ext of [".png", ".jpg", ".jpeg"]) {
    if (fs.existsSync(path.join(IMAGES_DIR, baseName + ext))) {
      return `/img/${baseName}${ext}`;
    }
  }

  // Файла пока нет — по умолчанию .png; позже можно просто перезапустить скрипт.
  return `/img/${baseName}.png`;
}

const CATEGORY = { name: "Шаурма", slug: "shawarma", sortOrder: 8 };

// Группы соусов/добавок (общие для нескольких товаров).
const GROUPS = [
  {
    name: "Соус",
    minSelect: 0,
    maxSelect: 1,
    options: [
      { name: "Чесночный", price: 0 },
      { name: "Грибной", price: 0 },
      { name: "Спайси соус", price: 0 },
      { name: "Сырный", price: 0 }
    ]
  },
 // {
  //  name: "Добавки",
   // minSelect: 0,
 //   maxSelect: 3,
//    options: [
 //     { name: "Сыр", price: 40 },
   //   { name: "Халапеньо", price: 25 },
     // { name: "Картофель фри", price: 50 }
    //]
 // }
];

// Товары. variants: пустой массив → товар с одной ценой (price).
const PRODUCTS = [
  {
    name: "Шаурма домашняя",
    description: "Курица, томаты, огурец, капуста, картофель фри, лаваш",
    composition: "Курица, томаты, огурец, капуста, картофель фри, лаваш",
    image: "dom",
    variants: [
      { name: "Маленькая", price: 320, weight: "" },
      { name: "Средняя", price: 390, weight: "" },
      { name: "Большая", price: 450, weight: "" }
    ],
    groups: ["Соус"]
  },
  {
    name: "Шаурма мясная",
    description: "Мясо х2, огурец, томат, лаваш",
    composition: "Мясо х2, огурец, томат, лаваш",
    image: "myaso",
    variants: [
      { name: "Маленькая", price: 370, weight: "" },
      { name: "Средняя", price: 440, weight: "" },
      { name: "Большая", price: 550, weight: "" }
    ],
    groups: ["Соус"]
  },
  {
    name: "Шаурма грибная",
    description: "Курица, капуста, лук, шампиньоны, лаваш",
    composition: "Курица, капуста, лук, шампиньоны, лаваш",
    image: "grib",
    variants: [
      { name: "Маленькая", price: 330, weight: "" },
      { name: "Средняя", price: 420, weight: "" },
      { name: "Большая", price: 490, weight: "" }
    ],
    groups: ["Соус"]
  },
  {
    name: "Шаурма гавайская",
    description: "Курица, ананас, капуста, лаваш",
    composition: "Курица, ананас, капуста, лаваш",
    image: "gavai",
    variants: [
      { name: "Маленькая", price: 320, weight: "" },
      { name: "Средняя", price: 390, weight: "" },
      { name: "Большая", price: 450, weight: "" }
    ],
    groups: ["Соус"]
  },
  {
    name: "Шаурма классическая",
    description: "Курица, томаты, огурец, лаваш",
    composition: "Курица, томаты, огурец, лаваш",
    image: "klassic",
    variants: [
      { name: "Маленькая", price: 300, weight: "" },
      { name: "Средняя", price: 380, weight: "" },
      { name: "Большая", price: 440, weight: "" }
    ],
    groups: ["Соус"]
  },
  {
    // Единственный размер: на сайте селектор скрыт, размер выбирается сам.
    name: "Шаурма с креветкой",
    description: "Креветка темпурная, капуста, томат, лаваш",
    composition: "Креветка темпурная, капуста, томат, лаваш",
    image: "sh_krevetka",
    variants: [{ name: "Средняя", price: 430, weight: "" }],
    groups: ["Соус"]
  }
];

async function ensureCategory() {
  const existing = await menuStore.findCategoryBySlug(CATEGORY.slug);
  if (existing) return existing;

  const res = await menuStore.addCategory(CATEGORY);
  if (!res.success) throw new Error(res.reason);
  return res.category;
}

async function ensureGroup(client, group) {
  let row = (await client.query("SELECT id FROM modifier_groups WHERE name = $1", [group.name])).rows[0];

  if (!row) {
    row = (
      await client.query(
        "INSERT INTO modifier_groups (name, min_select, max_select) VALUES ($1,$2,$3) RETURNING id",
        [group.name, group.minSelect, group.maxSelect]
      )
    ).rows[0];
  }

  let order = 0;
  for (const option of group.options) {
    await client.query(
      `INSERT INTO modifiers (group_id, name, price, sort_order)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (group_id, name) DO UPDATE SET price = EXCLUDED.price, sort_order = EXCLUDED.sort_order`,
      [row.id, option.name, option.price, order++]
    );
  }

  return row.id;
}

async function seed() {
  await db.initSchema();

  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    const category = await ensureCategory();

    const groupIds = new Map();
    for (const group of GROUPS) groupIds.set(group.name, await ensureGroup(client, group));

    for (const item of PRODUCTS) {
      // Базовая цена товара = минимальная цена размера (для «от X ₽» и поиска).
      const basePrice = Math.min(...item.variants.map(v => v.price));

      let product = (
        await client.query("SELECT id FROM products WHERE category_id = $1 AND name = $2", [category.id, item.name])
      ).rows[0];

      if (!product) {
        product = (
          await client.query(
            `INSERT INTO products (category_id, name, description, composition, weight, price, image_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [category.id, item.name, item.description, item.composition, item.variants[0].weight, basePrice, resolveImageUrl(item.image)]
          )
        ).rows[0];
        console.log(`✓ Товар «${item.name}»`);
      } else {
        await client.query("UPDATE products SET price = $1, image_url = $2 WHERE id = $3", [basePrice, resolveImageUrl(item.image), product.id]);
        console.log(`↷ Товар «${item.name}» уже есть — обновлены цены`);
      }

      let order = 0;
      for (const v of item.variants) {
        await client.query(
          `INSERT INTO product_variants (product_id, name, price, weight, sort_order)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (product_id, name) DO UPDATE
             SET price = EXCLUDED.price, weight = EXCLUDED.weight, sort_order = EXCLUDED.sort_order`,
          [product.id, v.name, v.price, v.weight, order++]
        );
      }

      order = 0;
      for (const groupName of item.groups) {
        await client.query(
          `INSERT INTO product_modifier_groups (product_id, group_id, sort_order)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [product.id, groupIds.get(groupName), order++]
        );
      }
    }

    await client.query("COMMIT");
    console.log("\n🌯 Шаурма добавлена.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await db.pool.end();
  }
}

seed().catch(error => {
  console.error("Ошибка:", error);
  process.exit(1);
});
