"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                        PROMOBOT.JS                           ║
║   Telegram-бот управления промокодами, товарами и            ║
║   категориями (для админа). Данные — в PostgreSQL             ║
║   (promoStore.js, menuStore.js).                              ║
╚══════════════════════════════════════════════════════════════╝

Написано под node-telegram-bot-api v2.x (Bot / Context / middleware).

Важно: у этой библиотеки в 2026 году вышел мажорный релиз v2 —
полностью новый API (Bot, ctx.reply, InlineKeyboardBuilder и т.д.),
несовместимый со старым v0.66/v1. Если вдруг снова увидишь ошибку
вроде "TelegramBot is not a constructor" или другую ошибку API —
значит вышла ещё одна breaking-версия библиотеки, и часть вызовов
ниже нужно будет поправить под неё.

ИЗМЕНЕНИЯ ПОСЛЕ ПЕРЕХОДА НА POSTGRESQL:

1. promoStore.findPromoCode()/listPromoCodes() теперь асинхронные
   (ходят в БД) — раньше это была синхронная работа с JSON-файлом.
   Все места, где их результат использовался напрямую без await,
   были багом (Promise в булевом контексте всегда truthy) —
   здесь везде расставлен await.

2. У промокода в новой схеме БД нет полей "срок действия"
   (starts_at/expires_at) — соответствующий шаг мастера
   /promo_add убран. Если такая функция нужна — сначала добавь
   колонки в schema.sql (см. комментарий в promoStore.js),
   потом верни шаг сюда.

3. Добавлено управление товарами и категориями:

   /category_list                  — список категорий
   /category_add НАЗВАНИЕ          — добавить категорию (slug и
                                      порядок сортировки — автоматически)
   /category_del SLUG              — удалить категорию (с подтверждением)

   /product_list [SLUG категории]  — список товаров (опц. по категории)
   /product_info ID                — подробности о товаре
   /product_add                    — добавить товар (пошагово)
   /product_del ID                 — удалить товар (с подтверждением)
   /product_on ID / /product_off ID — включить/выключить товар

Что делает файл:

1. Слушает сообщения от Telegram (long polling, bot.startPolling()).
2. Пускает к командам управления только тех, чей chat_id указан
   в ADMIN_CHAT_IDS (или TELEGRAM_CHAT_ID).
3. Даёт админу все команды, перечисленные выше, плюс:

   /promo_list, /promo_info CODE, /promo_add, /promo_del CODE,
   /promo_on CODE, /promo_off CODE, /cancel, /help

ВАЖНО:

У одного Telegram-бота (одного BOT_TOKEN) не может быть
одновременно двух активных способов получения апдейтов —
и long polling, и webhook. Если раньше на этот токен
настраивался webhook — его нужно снять, иначе будет
конфликт (ошибка 409 Conflict):

curl https://api.telegram.org/bot<ТОКЕН>/deleteWebhook

Отправка заказов клиенту (sendTelegramMessage в server.js)
работает независимо от этого бота — это обычный fetch-запрос,
polling ему не мешает.


===============================================================
УСТАНОВКА
===============================================================

npm install node-telegram-bot-api pg


===============================================================
.env
===============================================================

TELEGRAM_BOT_TOKEN=123456:ABCDEF...
TELEGRAM_CHAT_ID=123456789
ADMIN_CHAT_IDS=123456789,987654321   # необязательно, через запятую

Если ADMIN_CHAT_IDS не задан — используется только TELEGRAM_CHAT_ID.

===============================================================
*/

const { Bot, InlineKeyboardBuilder } = require("node-telegram-bot-api");

const {
  normalizePromoCode,
  listPromoCodes,
  findPromoCode,
  addPromoCode,
  deletePromoCode,
  setPromoActive
} = require("./promoStore");

const {
  listCategories,
  addCategory,
  deleteCategory,
  listProducts,
  findProductById,
  addProduct,
  setProductActive,
  deleteProduct
} = require("./menuStore");

/* ============================================================
   1. КОНФИГУРАЦИЯ / ДОСТУП
   ============================================================ */

const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();

const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();

/*
 * Список chat_id, которым разрешено управлять промокодами/товарами.
 *
 * Если ADMIN_CHAT_IDS не задан — админом считается
 * только TELEGRAM_CHAT_ID (тот же чат, куда падают заказы).
 */
const ADMIN_CHAT_IDS = String(process.env.ADMIN_CHAT_IDS || TELEGRAM_CHAT_ID || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

function isAdmin(chatId) {
  return ADMIN_CHAT_IDS.includes(String(chatId));
}

/*
 * chat_id можно достать по-разному в зависимости от типа апдейта —
 * берём с запасом, а не полагаемся на единственное имя поля.
 */
function getChatId(ctx) {
  return (
    ctx.chat?.id ??
    ctx.message?.chat?.id ??
    ctx.callbackQuery?.message?.chat?.id ??
    null
  );
}

/*
 * Если пользователь не админ — вежливо отказываем
 * (и отвечаем в подходящей форме: reply для сообщений,
 * answerCallbackQuery для нажатий на кнопки).
 */
async function denyIfNotAdmin(ctx) {
  const chatId = getChatId(ctx);

  if (isAdmin(chatId)) {
    return false;
  }

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: "Доступ запрещён." });
  } else {
    await ctx.reply("⛔ Доступ запрещён.");
  }

  return true;
}

/* ============================================================
   2. ОБЩЕЕ ФОРМАТИРОВАНИЕ
   ============================================================ */

function formatMoney(value) {
  const amount = Number(value) || 0;

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(amount);
}

/*
 * Простая транслитерация RU -> EN + kebab-case, для авто-slug
 * категории (чтобы админ мог просто написать "Роллы", а не
 * придумывать "rolls" вручную).
 */
const TRANSLIT_MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
};

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .split("")
    .map(char => (char in TRANSLIT_MAP ? TRANSLIT_MAP[char] : char))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "category";
}

/* ============================================================
   3. ФОРМАТИРОВАНИЕ — ПРОМОКОДЫ
   ============================================================ */

function formatDiscount(promo) {
  return promo.type === "percent" ? `${promo.value}%` : formatMoney(promo.value);
}

function formatPromoLine(promo) {
  const uses =
    promo.maxUses === null || promo.maxUses === undefined
      ? `${promo.usedCount || 0}`
      : `${promo.usedCount || 0}/${promo.maxUses}`;

  const emoji = promo.active === false ? "❌" : "✅";
  const status = promo.active === false ? "выключен" : "активен";

  return (
    `${emoji} <b>${promo.code}</b> — ` +
    `${formatDiscount(promo)} (${status}, использован ${uses})`
  );
}

function formatPromoDetails(promo) {
  const emoji = promo.active === false ? "❌" : "✅";
  const status = promo.active === false ? "выключен" : "активен";

  return [
    `${emoji} <b>${promo.code}</b>`,
    "",
    `Тип: ${promo.type === "percent" ? "процент" : "фикс. сумма"}`,
    `Скидка: ${formatDiscount(promo)}`,
    `Статус: ${status}`,
    `Мин. сумма заказа: ${formatMoney(promo.minOrderAmount || 0)}`,
    `Лимит использований: ${
      promo.maxUses === null || promo.maxUses === undefined ? "без лимита" : promo.maxUses
    }`,
    `Уже использован: ${promo.usedCount || 0} раз`
  ].join("\n");
}

/* ============================================================
   4. ФОРМАТИРОВАНИЕ — ТОВАРЫ И КАТЕГОРИИ
   ============================================================ */

function formatCategoryLine(category) {
  return `#${category.id} <b>${category.name}</b> (slug: ${category.slug}, порядок: ${category.sortOrder})`;
}

function formatProductLine(product) {
  const emoji = product.isActive === false ? "❌" : "✅";
  return `${emoji} #${product.id} <b>${product.name}</b> — ${formatMoney(product.price)}`;
}

function formatProductDetails(product, category) {
  const emoji = product.isActive === false ? "❌" : "✅";

  const lines = [
    `${emoji} #${product.id} <b>${product.name}</b>`,
    "",
    `Категория: ${category ? category.name : "—"}`,
    `Цена: ${formatMoney(product.price)}`,
    `Статус: ${product.isActive === false ? "выключен" : "активен"}`
  ];

  if (product.description) lines.push(`Описание: ${product.description}`);
  if (product.imageUrl) lines.push(`Картинка: ${product.imageUrl}`);

  return lines.join("\n");
}

/* ============================================================
   5. СОСТОЯНИЕ ДИАЛОГОВ (мастера /promo_add и /product_add)
   ============================================================ */

/*
 * chatId -> { type: 'promo_add' | 'product_add', step, data }
 *
 * Простое хранение в памяти процесса. Если сервер перезапустится
 * посреди диалога — его нужно будет начать заново.
 */
const sessions = new Map();

const PROMO_STEPS = {
  CODE: "code",
  TYPE: "type",
  VALUE: "value",
  MIN_ORDER: "minOrder",
  MAX_USES: "maxUses"
};

const PRODUCT_STEPS = {
  CATEGORY: "category",
  NAME: "name",
  DESCRIPTION: "description",
  PRICE: "price",
  IMAGE: "image"
};

/*
 * Telegram отклоняет сообщение длиннее 4096 символов
 * ("Bad Request: message is too long") — при большом списке
 * товаров/промокодов/категорий это легко превысить. Разбиваем
 * по строкам (никогда не рвём строку посередине, чтобы не
 * сломать HTML-теги вроде <b>...</b>) и шлём несколько сообщений
 * подряд вместо одного.
 */
const TELEGRAM_MESSAGE_LIMIT = 4096;

async function replyChunked(ctx, text, options = {}) {
  if (text.length <= TELEGRAM_MESSAGE_LIMIT) {
    await ctx.reply(text, options);
    return;
  }

  const lines = text.split("\n");
  let chunk = "";

  for (const line of lines) {
    if ((chunk + line + "\n").length > TELEGRAM_MESSAGE_LIMIT) {
      await ctx.reply(chunk.trimEnd(), options);
      chunk = "";
    }

    chunk += line + "\n";
  }

  if (chunk.trim()) {
    await ctx.reply(chunk.trimEnd(), options);
  }
}

/* ============================================================
   6. ЗАПУСК БОТА
   ============================================================ */

function start() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn(
      "⚠️  promoBot: TELEGRAM_BOT_TOKEN не задан — бот управления не запущен."
    );
    return null;
  }

  if (ADMIN_CHAT_IDS.length === 0) {
    console.warn(
      "⚠️  promoBot: не задан ни ADMIN_CHAT_IDS, ни TELEGRAM_CHAT_ID — " +
      "команды управления не будут доступны никому."
    );
  }

  const bot = new Bot(TELEGRAM_BOT_TOKEN);

  /*
   * Последний рубеж: ошибка в любом обработчике не должна
   * "уронить" бота или остановить polling.
   */
  bot.catch(error => {
    console.error("promoBot: необработанная ошибка обработчика:", error);
  });

  /* ----------------------------------------------------------
     /start, /help
     ---------------------------------------------------------- */
  async function sendHelp(ctx) {
    if (await denyIfNotAdmin(ctx)) return;

    await ctx.reply(
      [
        "🤖 <b>Управление магазином</b>",
        "",
        "<b>Промокоды</b>",
        "/promo_list — список всех промокодов",
        "/promo_info CODE — подробности по промокоду",
        "/promo_add — добавить промокод (пошагово)",
        "/promo_del CODE — удалить промокод",
        "/promo_on CODE / /promo_off CODE — включить/выключить",
        "",
        "<b>Категории</b>",
        "/category_list — список категорий",
        "/category_add НАЗВАНИЕ — добавить категорию",
        "/category_del SLUG — удалить категорию",
        "",
        "<b>Товары</b>",
        "/product_list [slug категории] — список товаров",
        "/product_info ID — подробности о товаре",
        "/product_add — добавить товар (пошагово)",
        "/product_del ID — удалить товар",
        "/product_on ID / /product_off ID — включить/выключить",
        "",
        "/cancel — прервать текущий диалог"
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  }

  bot.command("start", sendHelp);
  bot.command("help", sendHelp);

  /* ----------------------------------------------------------
     /cancel
     ---------------------------------------------------------- */
  bot.command("cancel", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const chatId = getChatId(ctx);

    if (sessions.has(chatId)) {
      sessions.delete(chatId);
      await ctx.reply("Диалог прерван.");
    } else {
      await ctx.reply("Нечего отменять.");
    }
  });

  /* ============================================================
     ПРОМОКОДЫ
     ============================================================ */

  bot.command("promo_list", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const promoCodes = await listPromoCodes();

    if (promoCodes.length === 0) {
      await ctx.reply("Промокодов пока нет. Добавить: /promo_add");
      return;
    }

    await replyChunked(ctx, promoCodes.map(formatPromoLine).join("\n"), {
      parse_mode: "HTML"
    });
  });

  bot.command("promo_info", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const code = normalizePromoCode(ctx.match);

    if (!code) {
      await ctx.reply("Использование: /promo_info CODE");
      return;
    }

    const promo = await findPromoCode(code);

    if (!promo) {
      await ctx.reply(`Промокод ${code} не найден.`);
      return;
    }

    await ctx.reply(formatPromoDetails(promo), { parse_mode: "HTML" });
  });

  async function togglePromo(ctx, active) {
    if (await denyIfNotAdmin(ctx)) return;

    const code = normalizePromoCode(ctx.match);

    if (!code) {
      await ctx.reply(`Использование: /promo_${active ? "on" : "off"} CODE`);
      return;
    }

    const result = await setPromoActive(code, active);

    if (!result.success) {
      await ctx.reply(`❌ ${result.reason}`);
      return;
    }

    await ctx.reply(`${active ? "✅ Включён" : "❌ Выключен"}: <b>${code}</b>`, {
      parse_mode: "HTML"
    });
  }

  bot.command("promo_on", ctx => togglePromo(ctx, true));
  bot.command("promo_off", ctx => togglePromo(ctx, false));

  bot.command("promo_del", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const code = normalizePromoCode(ctx.match);

    if (!code) {
      await ctx.reply("Использование: /promo_del CODE");
      return;
    }

    const promo = await findPromoCode(code);

    if (!promo) {
      await ctx.reply(`Промокод ${code} не найден.`);
      return;
    }

    await ctx.reply(`Удалить промокод <b>${code}</b>?`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboardBuilder()
        .text("✅ Да, удалить", `promo_del_confirm:${code}`)
        .text("Отмена", "promo_del_cancel")
        .build()
    });
  });

  bot.command("promo_add", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const chatId = getChatId(ctx);
    sessions.set(chatId, { type: "promo_add", step: PROMO_STEPS.CODE, data: {} });

    await ctx.reply(
      "Добавляем новый промокод.\n\nВведите код (например, SUMMER2026):\n\n" +
      "В любой момент можно отправить /cancel."
    );
  });

  /* ============================================================
     КАТЕГОРИИ
     ============================================================ */

  bot.command("category_list", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const categories = await listCategories();

    if (categories.length === 0) {
      await ctx.reply("Категорий пока нет. Добавить: /category_add НАЗВАНИЕ");
      return;
    }

    await replyChunked(ctx, categories.map(formatCategoryLine).join("\n"), {
      parse_mode: "HTML"
    });
  });

  bot.command("category_add", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const name = String(ctx.match || "").trim();

    if (!name) {
      await ctx.reply("Использование: /category_add НАЗВАНИЕ\nНапример: /category_add Роллы");
      return;
    }

    const categories = await listCategories();
    const nextSortOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1;

    const result = await addCategory({
      name,
      slug: slugify(name),
      sortOrder: nextSortOrder
    });

    if (!result.success) {
      await ctx.reply(`❌ ${result.reason}`);
      return;
    }

    await ctx.reply(`✅ Категория создана:\n\n${formatCategoryLine(result.category)}`, {
      parse_mode: "HTML"
    });
  });

  bot.command("category_del", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const slug = String(ctx.match || "").trim().toLowerCase();

    if (!slug) {
      await ctx.reply("Использование: /category_del SLUG\n(slug смотри в /category_list)");
      return;
    }

    const categories = await listCategories();
    const category = categories.find(c => c.slug === slug);

    if (!category) {
      await ctx.reply(`Категория со slug "${slug}" не найдена.`);
      return;
    }

    await ctx.reply(
      `Удалить категорию <b>${category.name}</b>? Товары в ней останутся, ` +
      `но потеряют привязку к категории.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboardBuilder()
          .text("✅ Да, удалить", `category_del_confirm:${category.id}`)
          .text("Отмена", "category_del_cancel")
          .build()
      }
    );
  });

  /* ============================================================
     ТОВАРЫ
     ============================================================ */

  bot.command("product_list", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const filterSlug = String(ctx.match || "").trim().toLowerCase();
    const products = await listProducts();

    let filtered = products;

    if (filterSlug) {
      const categories = await listCategories();
      const category = categories.find(c => c.slug === filterSlug);

      if (!category) {
        await ctx.reply(`Категория со slug "${filterSlug}" не найдена.`);
        return;
      }

      filtered = products.filter(p => p.categoryId === category.id);
    }

    if (filtered.length === 0) {
      await ctx.reply("Товаров пока нет. Добавить: /product_add");
      return;
    }

    await replyChunked(ctx, filtered.map(formatProductLine).join("\n"), {
      parse_mode: "HTML"
    });
  });

  bot.command("product_info", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const id = Number(ctx.match);

    if (!Number.isInteger(id)) {
      await ctx.reply("Использование: /product_info ID");
      return;
    }

    const product = await findProductById(id);

    if (!product) {
      await ctx.reply(`Товар #${id} не найден.`);
      return;
    }

    const categories = await listCategories();
    const category = categories.find(c => c.id === product.categoryId);

    await ctx.reply(formatProductDetails(product, category), { parse_mode: "HTML" });
  });

  async function toggleProduct(ctx, active) {
    if (await denyIfNotAdmin(ctx)) return;

    const id = Number(ctx.match);

    if (!Number.isInteger(id)) {
      await ctx.reply(`Использование: /product_${active ? "on" : "off"} ID`);
      return;
    }

    const result = await setProductActive(id, active);

    if (!result.success) {
      await ctx.reply(`❌ ${result.reason}`);
      return;
    }

    await ctx.reply(`${active ? "✅ Включён" : "❌ Выключен"}: #${id} <b>${result.product.name}</b>`, {
      parse_mode: "HTML"
    });
  }

  bot.command("product_on", ctx => toggleProduct(ctx, true));
  bot.command("product_off", ctx => toggleProduct(ctx, false));

  bot.command("product_del", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const id = Number(ctx.match);

    if (!Number.isInteger(id)) {
      await ctx.reply("Использование: /product_del ID");
      return;
    }

    const product = await findProductById(id);

    if (!product) {
      await ctx.reply(`Товар #${id} не найден.`);
      return;
    }

    await ctx.reply(`Удалить товар <b>${product.name}</b>?`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboardBuilder()
        .text("✅ Да, удалить", `product_del_confirm:${id}`)
        .text("Отмена", "product_del_cancel")
        .build()
    });
  });

  bot.command("product_add", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const chatId = getChatId(ctx);
    const categories = await listCategories();

    if (categories.length === 0) {
      await ctx.reply(
        "Сначала добавь хотя бы одну категорию: /category_add НАЗВАНИЕ"
      );
      return;
    }

    sessions.set(chatId, { type: "product_add", step: PRODUCT_STEPS.CATEGORY, data: {} });

    const keyboard = new InlineKeyboardBuilder();
    categories.forEach((category, index) => {
      keyboard.text(category.name, `product_add_category:${category.id}`);
      if (index % 2 === 1) keyboard.row();
    });

    await ctx.reply("Добавляем новый товар.\n\nВыберите категорию:", {
      reply_markup: keyboard.build()
    });
  });

  /* ----------------------------------------------------------
     Нажатия на inline-кнопки
     ---------------------------------------------------------- */
  bot.on("callback_query", async ctx => {
    if (await denyIfNotAdmin(ctx)) return;

    const data = ctx.callbackQuery.data || "";
    const chatId = getChatId(ctx);
    const messageId = ctx.callbackQuery.message?.message_id;

    /* --- промокоды: удаление --- */
    if (data.startsWith("promo_del_confirm:")) {
      const code = data.split(":")[1];
      const result = await deletePromoCode(code);

      await ctx.answerCallbackQuery();
      await ctx.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: result.success ? `🗑 Промокод <b>${code}</b> удалён.` : `❌ ${result.reason}`,
        parse_mode: "HTML"
      });
      return;
    }

    if (data === "promo_del_cancel") {
      await ctx.answerCallbackQuery();
      await ctx.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: "Удаление отменено."
      });
      return;
    }

    /* --- категории: удаление --- */
    if (data.startsWith("category_del_confirm:")) {
      const id = Number(data.split(":")[1]);
      const result = await deleteCategory(id);

      await ctx.answerCallbackQuery();
      await ctx.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: result.success ? "🗑 Категория удалена." : `❌ ${result.reason}`,
        parse_mode: "HTML"
      });
      return;
    }

    if (data === "category_del_cancel") {
      await ctx.answerCallbackQuery();
      await ctx.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: "Удаление отменено."
      });
      return;
    }

    /* --- товары: удаление --- */
    if (data.startsWith("product_del_confirm:")) {
      const id = Number(data.split(":")[1]);
      const result = await deleteProduct(id);

      await ctx.answerCallbackQuery();
      await ctx.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: result.success ? `🗑 Товар #${id} удалён.` : `❌ ${result.reason}`,
        parse_mode: "HTML"
      });
      return;
    }

    if (data === "product_del_cancel") {
      await ctx.answerCallbackQuery();
      await ctx.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: "Удаление отменено."
      });
      return;
    }

    /* --- выбор типа промокода в мастере /promo_add --- */
    if (data.startsWith("promo_add_type:")) {
      const session = sessions.get(chatId);

      if (!session || session.type !== "promo_add" || session.step !== PROMO_STEPS.TYPE) {
        await ctx.answerCallbackQuery({ text: "Диалог уже неактивен." });
        return;
      }

      const type = data.split(":")[1]; // 'percent' | 'fixed'
      session.data.type = type;
      session.step = PROMO_STEPS.VALUE;

      await ctx.answerCallbackQuery();
      await ctx.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text:
          `Тип: ${type === "percent" ? "процент" : "фикс. сумма"}. ` +
          `Теперь введите размер скидки числом ` +
          `(${type === "percent" ? "например, 15" : "например, 300"}):`
      });
      return;
    }

    /* --- выбор категории в мастере /product_add --- */
    if (data.startsWith("product_add_category:")) {
      const session = sessions.get(chatId);

      if (!session || session.type !== "product_add" || session.step !== PRODUCT_STEPS.CATEGORY) {
        await ctx.answerCallbackQuery({ text: "Диалог уже неактивен." });
        return;
      }

      const categoryId = Number(data.split(":")[1]);
      session.data.categoryId = categoryId;
      session.step = PRODUCT_STEPS.NAME;

      await ctx.answerCallbackQuery();
      await ctx.api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text: "Категория выбрана. Введите название товара:"
      });
      return;
    }

    await ctx.answerCallbackQuery();
  });

  /* ----------------------------------------------------------
     Обычные текстовые сообщения — нужны только для шагов
     мастеров /promo_add и /product_add. Команды сюда не
     долетают: если апдейт совпал с bot.command(...), этот
     обработчик для него уже не вызывается.
     ---------------------------------------------------------- */
  bot.on("message", async ctx => {
    const chatId = getChatId(ctx);

    if (!isAdmin(chatId)) return;

    const session = sessions.get(chatId);
    if (!session) return; // не в диалоге — ничего не делаем

    const text = (ctx.message?.text || "").trim();
    if (!text) return;

    if (session.type === "promo_add") {
      await handlePromoAddStep(ctx, chatId, session, text);
      return;
    }

    if (session.type === "product_add") {
      await handleProductAddStep(ctx, chatId, session, text);
      return;
    }
  });

  /* ----------------------------------------------------------
     Шаги мастера /promo_add
     ---------------------------------------------------------- */
  async function handlePromoAddStep(ctx, chatId, session, text) {
    switch (session.step) {
      case PROMO_STEPS.CODE: {
        const code = normalizePromoCode(text);

        if (!code) {
          await ctx.reply("Код не может быть пустым. Введите код ещё раз:");
          return;
        }

        if (await findPromoCode(code)) {
          await ctx.reply(`Промокод ${code} уже существует. Введите другой код:`);
          return;
        }

        session.data.code = code;
        session.step = PROMO_STEPS.TYPE;

        await ctx.reply("Выберите тип скидки:", {
          reply_markup: new InlineKeyboardBuilder()
            .text("% Процент", "promo_add_type:percent")
            .text("₽ Фикс. сумма", "promo_add_type:fixed")
            .build()
        });
        return;
      }

      case PROMO_STEPS.VALUE: {
        const value = Number(text.replace(",", "."));

        if (!Number.isFinite(value) || value <= 0) {
          await ctx.reply("Нужно положительное число. Попробуйте ещё раз:");
          return;
        }

        if (session.data.type === "percent" && value > 100) {
          await ctx.reply("Процент не может быть больше 100. Введите ещё раз:");
          return;
        }

        session.data.value = value;
        session.step = PROMO_STEPS.MIN_ORDER;

        await ctx.reply(
          "Минимальная сумма заказа для применения промокода?\n" +
          "Введите число или «-», если без ограничения:"
        );
        return;
      }

      case PROMO_STEPS.MIN_ORDER: {
        if (text === "-") {
          session.data.minOrderAmount = 0;
        } else {
          const minOrder = Number(text.replace(",", "."));

          if (!Number.isFinite(minOrder) || minOrder < 0) {
            await ctx.reply("Нужно неотрицательное число или «-». Ещё раз:");
            return;
          }

          session.data.minOrderAmount = minOrder;
        }

        session.step = PROMO_STEPS.MAX_USES;

        await ctx.reply(
          "Максимальное число использований промокода?\n" +
          "Введите целое число или «-», если без лимита:"
        );
        return;
      }

      case PROMO_STEPS.MAX_USES: {
        if (text === "-") {
          session.data.maxUses = null;
        } else {
          const maxUses = Number(text);

          if (!Number.isInteger(maxUses) || maxUses <= 0) {
            await ctx.reply("Нужно целое положительное число или «-». Ещё раз:");
            return;
          }

          session.data.maxUses = maxUses;
        }

        const result = await addPromoCode(session.data);
        sessions.delete(chatId);

        if (!result.success) {
          await ctx.reply(`❌ Не удалось создать промокод: ${result.reason}`);
          return;
        }

        await ctx.reply(`✅ Промокод создан:\n\n${formatPromoDetails(result.promo)}`, {
          parse_mode: "HTML"
        });
        return;
      }

      default:
        return;
    }
  }

  /* ----------------------------------------------------------
     Шаги мастера /product_add
     ---------------------------------------------------------- */
  async function handleProductAddStep(ctx, chatId, session, text) {
    switch (session.step) {
      case PRODUCT_STEPS.NAME: {
        if (!text) {
          await ctx.reply("Название не может быть пустым. Введите ещё раз:");
          return;
        }

        session.data.name = text;
        session.step = PRODUCT_STEPS.DESCRIPTION;

        await ctx.reply("Описание товара? Введите текст или «-», чтобы пропустить:");
        return;
      }

      case PRODUCT_STEPS.DESCRIPTION: {
        session.data.description = text === "-" ? null : text;
        session.step = PRODUCT_STEPS.PRICE;

        await ctx.reply("Цена товара (число, например 590):");
        return;
      }

      case PRODUCT_STEPS.PRICE: {
        const price = Number(text.replace(",", "."));

        if (!Number.isFinite(price) || price < 0) {
          await ctx.reply("Нужно неотрицательное число. Попробуйте ещё раз:");
          return;
        }

        session.data.price = price;
        session.step = PRODUCT_STEPS.IMAGE;

        await ctx.reply("Ссылка на картинку товара? Введите URL или «-», чтобы пропустить:");
        return;
      }

      case PRODUCT_STEPS.IMAGE: {
        session.data.imageUrl = text === "-" ? null : text;

        const result = await addProduct(session.data);
        sessions.delete(chatId);

        if (!result.success) {
          await ctx.reply(`❌ Не удалось создать товар: ${result.reason}`);
          return;
        }

        await ctx.reply(`✅ Товар создан:\n\n${formatProductDetails(result.product)}`, {
          parse_mode: "HTML"
        });
        return;
      }

      default:
        return;
    }
  }

  /*
   * bot.startPolling() — long-running промис, который живёт,
   * пока идёт опрос Telegram. Специально не await'им его здесь,
   * чтобы не блокировать остальной запуск сервера — ошибки ловим
   * через .catch().
   */
  bot.startPolling().catch(error => {
    console.error("promoBot: ошибка long polling:", error.message || error);
  });

  console.log(
    `🤖 promoBot запущен. Админы (chat_id): ${ADMIN_CHAT_IDS.join(", ") || "не заданы"}`
  );

  return bot;
}

module.exports = { start };
