"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                        SERVER.JS                             ║
║          Серверная часть магазина суши и роллов             ║
╚══════════════════════════════════════════════════════════════╝

Что делает сервер:

1. Раздаёт статические файлы сайта.
2. Принимает JSON-запросы.
3. Отдаёт меню (категории + товары) из PostgreSQL — GET /api/menu.
4. Проверяет промокоды (превью — без списания).
5. Принимает заказы: пересчитывает цены по id товаров из БД
   (клиенту нельзя доверять ни цену, ни название товара),
   атомарно списывает использование промокода и сохраняет
   заказ — всё одной транзакцией (BEGIN/COMMIT).
6. Формирует и отправляет сообщение о заказе в Telegram —
   ПОСЛЕ того, как заказ уже надёжно сохранён в БД.
7. Запускает Telegram-бота управления промокодами и товарами
   (promoBot.js) — прямо из Telegram, без доступа к серверу.

Архитектура данных (было: JSON-файлы → стало: PostgreSQL):

  db.js          — пул подключений (pg.Pool) + инициализация схемы
  schema.sql     — CREATE TABLE для categories/products/promocodes/
                   orders/order_items
  menuStore.js   — репозиторий категорий и товаров
  promoStore.js  — репозиторий промокодов (используется и здесь,
                   и в promoBot.js)
  ordersStore.js — сохранение заказов и их состава
  seed.js        — разовое наполнение БД стартовыми категориями
                   и товарами (node seed.js)

ВАЖНО:

Никогда не храните BOT_TOKEN и пароль от БД непосредственно
в server.js.

Используйте файл .env:

# PostgreSQL
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=sushi_user
PGPASSWORD=укажи-свой-пароль
PGDATABASE=sushi_shop
# либо одной строкой (перекрывает PG*-переменные выше):
# DATABASE_URL=postgres://user:password@host:5432/dbname
# PGSSL=true   — если БД требует SSL (облачные провайдеры)

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
TELEGRAM_CHAT_ID=123456789
ADMIN_CHAT_IDS=123456789,987654321

# Email-дубликат заказа (необязательно — если не задать,
# просто не будет отправляться, остальное работает как обычно)
ORDER_NOTIFY_EMAIL=owner@example.com
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=shop@yandex.ru
SMTP_PASSWORD=пароль-приложения
SMTP_FROM=shop@yandex.ru

PORT=3000

ADMIN_CHAT_IDS — список chat_id (через запятую), которым
разрешено управлять промокодами и товарами через Telegram-бота
(promoBot.js). Если не задать — админом считается
только TELEGRAM_CHAT_ID.

Файл .env НЕ должен попадать в Git.


===============================================================
УСТАНОВКА
===============================================================

npm install express cors dotenv node-telegram-bot-api pg nodemailer

Также при первом запуске (или после смены токена):

curl https://api.telegram.org/bot<ТОКЕН>/deleteWebhook

Это нужно, чтобы у бота не было одновременно активного
webhook и long polling (см. подробности в promoBot.js).

Инструкция по установке и настройке самого PostgreSQL на
Ubuntu VPS — см. отдельный файл POSTGRES_SETUP.md.


===============================================================
ЗАПУСК
===============================================================

node server.js

При первом запуске (или на новом сервере) один раз:

node seed.js


===============================================================
API
===============================================================

GET  /api/menu

POST /api/validate-coupon
POST /api/promo/validate

POST /api/checkout

GET  /api/health


===============================================================
*/

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

/*
 * ВАЖНО: dotenv.config() должен выполниться ДО require("./db")
 * (и любого другого модуля, который читает process.env при
 * загрузке). db.js создаёт pg.Pool сразу при подключении модуля,
 * читая PGHOST/PGUSER/PGPASSWORD и т.д. — если .env ещё не
 * загружен в этот момент, пул тихо соберётся с пустыми/дефолтными
 * значениями (PGUSER по умолчанию "postgres" и т.д.), и сервер
 * будет пытаться подключиться совсем не туда, куда нужно,
 * с непонятной ошибкой аутентификации.
 */
dotenv.config();

/*
 * Слой данных — теперь PostgreSQL, а не JSON-файлы.
 *
 * db.js         — пул подключений + инициализация схемы (schema.sql)
 * menuStore.js  — категории и товары (источник ЧЕСТНЫХ цен для checkout)
 * promoStore.js — промокоды (теперь в таблице promocodes, не в файле)
 * ordersStore.js — сохранение заказов и их состава (orders, order_items)
 */
const db = require("./db");
const menuStore = require("./menuStore");
const promoStore = require("./promoStore");
const ordersStore = require("./ordersStore");
const emailNotifier = require("./emailNotifier");


/* ============================================================
   2. КОНФИГУРАЦИЯ
   ============================================================ */

const PORT =
  Number(process.env.PORT) || 3000;


const TELEGRAM_BOT_TOKEN =
  String(
    process.env.TELEGRAM_BOT_TOKEN || ""
  ).trim();


const TELEGRAM_CHAT_ID =
  String(
    process.env.TELEGRAM_CHAT_ID || ""
  ).trim();


/*
 * Корневая директория проекта.
 */
const ROOT_DIR =
  __dirname;


/*
 * Промокоды, товары и заказы теперь живут в PostgreSQL —
 * см. db.js, menuStore.js, promoStore.js, ordersStore.js.
 * Отдельного файла для промокодов больше нет.
 */


/*
 * Максимальный размер JSON-запроса.
 *
 * Это защищает endpoint от чрезмерно больших payload.
 */
const JSON_LIMIT =
  "100kb";


/* ============================================================
   3. EXPRESS
   ============================================================ */

const app =
  express();


/*
 * CORS.
 *
 * Для локальной разработки разрешаем запросы
 * с разных origin.
 *
 * В production рекомендуется указать конкретный домен.
 */
const corsOptions = {

  origin: true,

  methods: [
    "GET",
    "POST",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Accept"
  ]

};


app.use(
  cors(corsOptions)
);


/*
 * JSON body parser.
 */
app.use(
  express.json({
    limit: JSON_LIMIT
  })
);


/*
 * URL-encoded body.
 */
app.use(
  express.urlencoded({
    extended: true,
    limit: JSON_LIMIT
  })
);


/* ============================================================
   4. STATIC FRONTEND
   ============================================================ */

/*
 * Все файлы:

 index.html
 styles.css
 app.js
 menu-data.js
 images/...

будут доступны через текущий домен.
 */
app.use(
  express.static(
    ROOT_DIR,
    {
      extensions: [
        "html"
      ]
    }
  )
);


/* ============================================================
   5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ============================================================ */


/*
 * Форматирование рублей.
 */
function formatMoney(
  value
) {

  const amount =
    Number(value) || 0;


  return new Intl.NumberFormat(
    "ru-RU",
    {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0
    }
  ).format(amount);

}


/*
 * Получить число.
 */
function toNumber(
  value,
  fallback = 0
) {

  const number =
    Number(value);


  if (
    !Number.isFinite(number)
  ) {

    return fallback;

  }


  return number;

}


/*
 * Экранирование HTML.

 Telegram будет получать сообщение
 в parse_mode=HTML.

 Поэтому пользовательские данные НЕЛЬЗЯ
 вставлять в Telegram-сообщение напрямую.

Например:

<Иван>

должно превратиться в:

&lt;Иван&gt;
 */
function escapeTelegramHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    );

}


/*
 * Нормализация промокода.
 *
 * Реализация вынесена в promoStore.js (используется и ботом),
 * здесь оставляем короткий алиас, чтобы не переписывать
 * весь остальной код файла.
 */
const normalizePromoCode = promoStore.normalizePromoCode;


/*
 * Нормализация телефона.
 */
function normalizePhone(
  phone
) {

  return String(
    phone || ""
  )
    .trim()
    .replace(
      /[^\d+]/g,
      ""
    );

}


/*
 * Проверка телефона.
 */
function isValidPhone(
  phone
) {

  const digits =
    normalizePhone(
      phone
    ).replace(
      /\D/g,
      ""
    );


  return (
    digits.length >= 10 &&
    digits.length <= 15
  );

}


/*
 * Текущая дата/время для сообщения администратору.
 */
function getFormattedDate() {

  return new Intl.DateTimeFormat(
    "ru-RU",
    {
      dateStyle: "short",
      timeStyle: "short"
    }
  ).format(
    new Date()
  );

}


/*
 * Номер заказа теперь — это просто "SUSHI-" + serial id
 * из таблицы orders (см. /api/checkout) — реальный,
 * уникальный, выданный PostgreSQL, а не сгенерированный
 * "на глаз" на сервере.
 */


/* ============================================================
   6. ПРОВЕРКА ПРОМОКОДА (без списания — для превью в корзине)
   ============================================================ */

/*
 * Логика проверки/расчёта скидки живёт в promoStore.js
 * (таблица promocodes в PostgreSQL) — здесь используется
 * напрямую promoStore.previewPromo(code, subtotal), поэтому
 * отдельная функция validateCoupon здесь больше не нужна.
 */


/* ============================================================
   8. API ПРОМОКОДОВ
   ============================================================ */


/*
 * ВАЖНО — изменение контракта по сравнению с предыдущей версией:
 *
 * Раньше сюда присылали {code, subtotal} — subtotal готовым
 * числом от клиента. Это тот же самый риск подмены цены, только
 * в мини-версии (можно было прислать subtotal: 1, получить скидку
 * от единицы). Теперь сюда, как и в /api/checkout, присылают
 * {code, items: [{id, quantity}]} — сумма всегда считается
 * сервером по честным ценам из БД.
 *
 * Это ПРЕВЬЮ (без списания usage_limit) — реальное списание
 * происходит только в /api/checkout, внутри транзакции
 * (см. promoStore.consumePromoInTransaction).
 */
async function calculateSubtotalFromItems(items) {

  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Корзина пуста." };
  }

  const productsById =
    await menuStore.findProductsByIds(
      items.map(item => item.id)
    );

  let subtotal = 0;

  for (const item of items) {

    const product =
      productsById.get(Number(item.id));

    const quantity =
      Number(item.quantity);

    if (
      !product ||
      !product.isActive
    ) {
      return { error: `Товар с id ${item.id} недоступен.` };
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) {
      return { error: `Некорректное количество товара ${item.id}.` };
    }

    subtotal += product.price * quantity;

  }

  return { subtotal };

}


/*
 * POST /api/validate-coupon
 * body: { code, items: [{ id, quantity }] }
 */
app.post(
  "/api/validate-coupon",
  async (req, res) => {

    try {

      const {
        code,
        items
      } = req.body || {};


      const subtotalResult =
        await calculateSubtotalFromItems(items);


      if (subtotalResult.error) {

        return res.status(400).json({

          success: false,

          valid: false,

          message:
          subtotalResult.error

        });

      }


      const result =
        await promoStore.previewPromo(
          code,
          subtotalResult.subtotal
        );


      if (!result.valid) {

        return res.status(400).json({

          success: false,

          valid: false,

          message:
          result.reason

        });

      }


      return res.json({

        success: true,

        valid: true,

        message:
          "Промокод применён.",

        promo: {

          code:
          result.code,

          type:
          result.type,

          value:
          result.value,

          discount:
          result.discount,

          subtotal:
          result.subtotal,

          total:
          result.total

        }

      });

    } catch (error) {

      console.error(
        "Ошибка /api/validate-coupon:",
        error
      );


      return res.status(500).json({

        success: false,

        valid: false,

        message:
          "Ошибка проверки промокода."

      });

    }

  }
);


/*
 * Совместимость с app.js из Части 2.

 app.js использует:

 POST /api/promo/validate

 body: { code, items: [{ id, quantity }] } — тот же контракт,
 что и у /api/validate-coupon выше.
 */
app.post(
  "/api/promo/validate",
  async (req, res) => {

    try {

      const {
        code,
        items
      } = req.body || {};


      const subtotalResult =
        await calculateSubtotalFromItems(items);


      if (subtotalResult.error) {

        return res.status(400).json({

          success: false,

          message:
          subtotalResult.error

        });

      }


      const result =
        await promoStore.previewPromo(
          code,
          subtotalResult.subtotal
        );


      if (!result.valid) {

        return res.status(400).json({

          success: false,

          message:
          result.reason

        });

      }


      return res.json({

        success: true,

        message:
          "Промокод применён.",

        promo: {

          code:
          result.code,

          type:
          result.type,

          value:
          result.value,

          discount:
          result.discount

        }

      });

    } catch (error) {

      console.error(
        "Ошибка /api/promo/validate:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Ошибка проверки промокода."

      });

    }

  }
);


/* ============================================================
   9. ПРОВЕРКА СТРУКТУРЫ ЗАКАЗА
   ============================================================ */


/*
 * Проверка формы корзины.
 *
 * ВАЖНО: клиент теперь присылает ТОЛЬКО [{ id, quantity }] —
 * ни имени, ни цены. Даже если браузер (или человек через
 * DevTools/Postman) пришлёт item.price — сервер его просто
 * не читает нигде ниже. Настоящие цена и название всегда
 * берутся из PostgreSQL (см. menuStore.findProductsByIds
 * внутри /api/checkout).
 */
function validateOrderItemsShape(
  items
) {

  if (
    !Array.isArray(items)
  ) {

    return {

      valid: false,

      reason:
        "Корзина имеет некорректный формат."

    };

  }


  if (
    items.length === 0
  ) {

    return {

      valid: false,

      reason:
        "Корзина пуста."

    };

  }


  if (
    items.length > 100
  ) {

    return {

      valid: false,

      reason:
        "Слишком много различных товаров."

    };

  }


  for (
    const item of items
    ) {

    const id =
      Number(item?.id);


    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {

      return {

        valid: false,

        reason:
          "У товара некорректный ID."

      };

    }


    const quantity =
      Number(
        item.quantity
      );


    if (
      !Number.isInteger(
        quantity
      ) ||
      quantity < 1 ||
      quantity > 100
    ) {

      return {

        valid: false,

        reason:
          `Некорректное количество товара ${id}.`

      };

    }

  }


  return {

    valid: true

  };

}


/* ============================================================
   10. ПРОВЕРКА ДАННЫХ КЛИЕНТА
   ============================================================ */

function validateCustomer(
  customer
) {

  if (
    !customer ||
    typeof customer !==
    "object"
  ) {

    return {

      valid: false,

      reason:
        "Данные клиента отсутствуют."

    };

  }


  const name =
    String(
      customer.name || ""
    ).trim();


  const phone =
    normalizePhone(
      customer.phone
    );


  if (
    name.length < 2
  ) {

    return {

      valid: false,

      reason:
        "Укажите имя клиента."

    };

  }


  if (
    name.length > 100
  ) {

    return {

      valid: false,

      reason:
        "Имя клиента слишком длинное."

    };

  }


  if (
    !isValidPhone(
      phone
    )
  ) {

    return {

      valid: false,

      reason:
        "Укажите корректный номер телефона."

    };

  }


  return {

    valid: true,

    name,

    phone

  };

}


/*
 * Проверка способа получения.
 */
function validateFulfillment(
  fulfillment
) {

  if (
    !fulfillment ||
    typeof fulfillment !==
    "object"
  ) {

    return {

      valid: false,

      reason:
        "Не указан способ получения заказа."

    };

  }


  const type =
    String(
      fulfillment.type || ""
    ).toLowerCase();


  if (
    type !== "delivery" &&
    type !== "pickup"
  ) {

    return {

      valid: false,

      reason:
        "Неизвестный способ получения заказа."

    };

  }


  const address =
    String(
      fulfillment.address || ""
    ).trim();


  if (
    type === "delivery" &&
    address.length < 5
  ) {

    return {

      valid: false,

      reason:
        "Для доставки необходимо указать адрес."

    };

  }


  if (
    address.length > 500
  ) {

    return {

      valid: false,

      reason:
        "Адрес слишком длинный."

    };

  }


  const apartment =
    String(
      fulfillment.apartment || ""
    ).trim();


  const entrance =
    String(
      fulfillment.entrance || ""
    ).trim();


  const comment =
    String(
      fulfillment.comment || ""
    ).trim();


  if (
    comment.length > 1000
  ) {

    return {

      valid: false,

      reason:
        "Комментарий слишком длинный."

    };

  }


  return {

    valid: true,

    type,

    address,

    apartment,

    entrance,

    comment

  };

}


/* ============================================================
   11. ЦЕНООБРАЗОВАНИЕ ЗАКАЗА — ТЕПЕРЬ ВНУТРИ ТРАНЗАКЦИИ CHECKOUT
   ============================================================ */

/*
 * Раньше здесь была функция calculateOrderPricing(items, promoCode),
 * которая доверяла ценам из браузера и лишь перепроверяла итог.
 *
 * Теперь пересчёт цены, проверка промокода (с блокировкой строки
 * SELECT ... FOR UPDATE) и сохранение заказа выполняются одним
 * блоком прямо в обработчике /api/checkout — потому что все три
 * шага должны использовать ОДИН И ТОТ ЖЕ pg-клиент транзакции
 * (db.getClient() + BEGIN/COMMIT), иначе нет смысла в атомарности:
 * подробности — в разделе "15. CHECKOUT" ниже.
 */


/* ============================================================
   12. TELEGRAM BOT API
   ============================================================ */


/*
 * Проверяем наличие настроек Telegram.
 */
function isTelegramConfigured() {

  return (
    TELEGRAM_BOT_TOKEN.length > 0 &&
    TELEGRAM_CHAT_ID.length > 0
  );

}


/*
 * URL Telegram Bot API.
 */
function getTelegramApiUrl(
  method
) {

  return (
    `https://api.telegram.org/bot` +
    `${TELEGRAM_BOT_TOKEN}/` +
    method
  );

}


/*
 * Отправка сообщения в Telegram.
 */
async function sendTelegramMessage(
  text
) {

  if (
    !isTelegramConfigured()
  ) {

    throw new Error(
      "Telegram Bot API не настроен. " +
      "Проверьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID."
    );

  }


  const response =
    await fetch(
      getTelegramApiUrl(
        "sendMessage"
      ),
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          "Accept":
            "application/json"

        },

        body:
          JSON.stringify({

            chat_id:
            TELEGRAM_CHAT_ID,

            text,

            parse_mode:
              "HTML",

            disable_web_page_preview:
              true

          })

      }
    );


  let data = null;


  try {

    data =
      await response.json();

  } catch {

    data = null;

  }


  if (
    !response.ok ||
    !data ||
    data.ok !== true
  ) {

    const telegramDescription =
      data?.description ||
      "Неизвестная ошибка Telegram API.";


    throw new Error(
      `Telegram API: ${telegramDescription}`
    );

  }


  return data;

}


/* ============================================================
   13. ФОРМАТИРОВАНИЕ ЗАКАЗА ДЛЯ TELEGRAM
   ============================================================ */


/*
 * Иконка способа получения.
 */
function getFulfillmentIcon(
  type
) {

  return type ===
  "pickup"
    ? "🏪"
    : "🚗";

}


/*
 * Название способа получения.
 */
function getFulfillmentName(
  type
) {

  return type ===
  "pickup"
    ? "Самовывоз"
    : "Доставка";

}


/*
 * Формирование красивого сообщения.
 */
function buildTelegramOrderMessage(
  order
) {

  const {

    orderNumber,

    customer,

    fulfillment,

    items,

    pricing,

    promo,

    payment

  } = order;


  const lines = [];


  /*
   * Заголовок.
   */
  lines.push(
    "🍣 <b>НОВЫЙ ЗАКАЗ</b>"
  );


  lines.push(
    `🧾 <b>Заказ:</b> <code>${escapeTelegramHtml(orderNumber)}</code>`
  );


  lines.push(
    `🕐 <b>Время:</b> ${escapeTelegramHtml(getFormattedDate())}`
  );


  lines.push(
    ""
  );


  /*
   * Клиент.
   */
  lines.push(
    "👤 <b>КЛИЕНТ</b>"
  );


  lines.push(
    `Имя: <b>${escapeTelegramHtml(customer.name)}</b>`
  );


  lines.push(
    `📞 Телефон: <b>${escapeTelegramHtml(customer.phone)}</b>`
  );


  lines.push(
    ""
  );


  /*
   * Получение.
   */
  lines.push(
    `${getFulfillmentIcon(fulfillment.type)} <b>ПОЛУЧЕНИЕ</b>`
  );


  lines.push(
    `<b>${getFulfillmentName(fulfillment.type)}</b>`
  );


  if (
    fulfillment.type ===
    "delivery"
  ) {

    lines.push(
      `📍 Адрес: <b>${escapeTelegramHtml(fulfillment.address)}</b>`
    );


    if (
      fulfillment.apartment
    ) {

      lines.push(
        `🏠 Квартира: ${escapeTelegramHtml(fulfillment.apartment)}`
      );

    }


    if (
      fulfillment.entrance
    ) {

      lines.push(
        `🚪 Подъезд: ${escapeTelegramHtml(fulfillment.entrance)}`
      );

    }

  }


  lines.push(
    ""
  );


  /*
   * Состав заказа.
   */
  lines.push(
    "🍱 <b>СОСТАВ ЗАКАЗА</b>"
  );


  items.forEach(
    (
      item,
      index
    ) => {

      const itemName =
        escapeTelegramHtml(
          item.name
        );


      const quantity =
        Number(
          item.quantity
        );


      const price =
        toNumber(
          item.price
        );


      const itemTotal =
        price *
        quantity;


      lines.push(
        `${index + 1}. ${itemName}`
      );


      lines.push(
        `   └ ${quantity} × ${formatMoney(price)} = <b>${formatMoney(itemTotal)}</b>`
      );

    }
  );


  lines.push(
    ""
  );


  /*
   * Оплата.
   */
  if (
    payment?.method
  ) {

    const paymentName =
      getPaymentName(
        payment.method
      );


    lines.push(
      `💳 <b>Оплата:</b> ${escapeTelegramHtml(paymentName)}`
    );


    if (
      payment.changeFrom
    ) {

      lines.push(
        `💵 <b>Нужна сдача с:</b> ${formatMoney(payment.changeFrom)}`
      );

    }

  }


  /*
   * Промокод.
   */
  if (
    promo?.code
  ) {

    lines.push(
      `🎟 <b>Промокод:</b> <code>${escapeTelegramHtml(promo.code)}</code>`
    );


    lines.push(
      `💸 <b>Скидка:</b> −${formatMoney(pricing.discount)}`
    );

  }


  /*
   * Финансы.
   */
  lines.push(
    ""
  );


  lines.push(
    `🧮 Сумма товаров: ${formatMoney(pricing.subtotal)}`
  );


  if (
    pricing.discount > 0
  ) {

    lines.push(
      `🔻 Скидка: −${formatMoney(pricing.discount)}`
    );

  }


  lines.push(
    `💰 <b>ИТОГО: ${formatMoney(pricing.total)}</b>`
  );


  /*
   * Комментарий.
   */
  if (
    fulfillment.comment
  ) {

    lines.push(
      ""
    );


    lines.push(
      "💬 <b>КОММЕНТАРИЙ</b>"
    );


    lines.push(
      escapeTelegramHtml(
        fulfillment.comment
      )
    );

  }


  /*
   * Разделитель.
   */
  lines.push(
    ""
  );


  lines.push(
    "━━━━━━━━━━━━━━━━━━"
  );


  lines.push(
    "🛵 Проверьте заказ и свяжитесь с клиентом."
  );


  return lines.join(
    "\n"
  );

}


/*
 * Письмо-дубликат заказа на почту.
 *
 * Telegram-сообщение выше уже собрано с HTML-тегами (<b>, <code>) —
 * это ОДНОВРЕМЕННО валидный HTML, так что не пришлось заново
 * писать вёрстку письма: просто переносы строк превращаем в <br>
 * и оборачиваем в простой контейнер со шрифтом.
 */
function buildOrderEmailHtml(
  order
) {

  const telegramText =
    buildTelegramOrderMessage(
      order
    );


  const htmlLines =
    telegramText
      .split("\n")
      .map(line => line || "&nbsp;")
      .join("<br>");


  return (
    `<div style="font-family: Arial, Helvetica, sans-serif; ` +
    `font-size: 15px; line-height: 1.6; color: #241512;">` +
    `${htmlLines}</div>`
  );

}


function buildOrderEmailSubject(
  order
) {

  return (
    `Новый заказ ${order.orderNumber} — ` +
    formatMoney(order.pricing.total)
  );

}


/*
 * Человекочитаемое название оплаты.
 */
function getPaymentName(
  method
) {

  const methods = {

    cash:
      "Наличными",

    card:
      "Картой",

    online:
      "Онлайн"

  };


  return methods[
      method
      ] ||
    method;

}


/* ============================================================
   14. (РАЗДЕЛ УПРАЗДНЁН)
   ============================================================ */

/*
 * Раньше здесь жила отдельная функция инкремента promo usage
 * поверх JSON-файла. Теперь списание использования промокода —
 * неотъемлемая часть транзакции чекаута ниже
 * (promoStore.consumePromoInTransaction), поэтому отдельной
 * функции больше нет.
 */


/* ============================================================
   15. CHECKOUT
   ============================================================ */


/*
 * POST /api/checkout
 * body: {
 *   customer: { name, phone },
 *   fulfillment: { type, address, apartment, entrance, comment },
 *   items: [{ id, quantity }],   <-- ТОЛЬКО id и количество
 *   promo: { code },              <-- необязательно
 *   payment: { method }
 * }
 *
 * Ключевая идея всей функции: клиент не может повлиять на итоговую
 * цену заказа. Единственное, что решает клиент — ЧТО и СКОЛЬКО он
 * хочет заказать (id + quantity). Сколько это стоит — решает
 * только PostgreSQL, внутри одной транзакции:
 *
 *   BEGIN
 *     SELECT цены товаров по id           (menuStore.findProductsByIds)
 *     SELECT ... FOR UPDATE промокода     (promoStore.consumePromoInTransaction)
 *     INSERT INTO orders
 *     INSERT INTO order_items
 *   COMMIT
 *
 * Если что-то пошло не так на любом шаге — ROLLBACK, в БД не
 * остаётся ни заказа, ни "наполовину списанного" промокода.
 */
app.post(
  "/api/checkout",
  async (req, res) => {

    const body =
      req.body || {};


    /*
     * --------------------------------------------------
     * 1. Проверяем клиента
     * --------------------------------------------------
     */
    const customerResult =
      validateCustomer(
        body.customer
      );


    if (
      !customerResult.valid
    ) {

      return res.status(400).json({

        success: false,

        message:
        customerResult.reason

      });

    }


    /*
     * --------------------------------------------------
     * 2. Проверяем способ получения
     * --------------------------------------------------
     */
    const fulfillmentResult =
      validateFulfillment(
        body.fulfillment
      );


    if (
      !fulfillmentResult.valid
    ) {

      return res.status(400).json({

        success: false,

        message:
        fulfillmentResult.reason

      });

    }


    /*
     * --------------------------------------------------
     * 3. Проверяем ФОРМУ корзины (id + quantity).
     *    Цену здесь ещё не знаем — узнаем из БД внутри
     *    транзакции ниже.
     * --------------------------------------------------
     */
    const itemsShapeResult =
      validateOrderItemsShape(
        body.items
      );


    if (
      !itemsShapeResult.valid
    ) {

      return res.status(400).json({

        success: false,

        message:
        itemsShapeResult.reason

      });

    }


    const promoCode =
      normalizePromoCode(
        body.promo?.code
      );


    /*
     * --------------------------------------------------
     * 4. Открываем транзакцию
     * --------------------------------------------------
     */
    const client =
      await db.getClient();

    let insertedOrder = null;
    let orderItemsForMessage = [];
    let subtotal = 0;
    let discount = 0;
    let total = 0;
    let promoResult = null;
    let changeFrom = null;

    const paymentMethod =
      String(
        body.payment?.method || "cash"
      );

    try {

      await client.query(
        "BEGIN"
      );


      /*
       * ------------------------------------------------
       * 4a. Честные цены из БД — по id, ИГНОРИРУЯ
       *     любые name/price, которые мог прислать клиент.
       * ------------------------------------------------
       */
      const productsById =
        await menuStore.findProductsByIds(
          body.items.map(item => item.id),
          client
        );


      for (
        const item of body.items
        ) {

        const product =
          productsById.get(
            Number(item.id)
          );


        if (
          !product ||
          !product.isActive
        ) {

          await client.query(
            "ROLLBACK"
          );

          return res.status(400).json({

            success: false,

            message:
              `Товар с id ${item.id} недоступен или не найден. ` +
              "Обновите страницу и соберите корзину заново."

          });

        }


        const quantity =
          Number(item.quantity);


        subtotal +=
          product.price *
          quantity;


        orderItemsForMessage.push({

          productId: product.id,

          productName: product.name,

          unitPrice: product.price,

          quantity

        });

      }


      /*
       * ------------------------------------------------
       * 4b. Промокод — проверка + списание С БЛОКИРОВКОЙ
       *     строки, атомарно, в этой же транзакции.
       * ------------------------------------------------
       */
      total = subtotal;

      if (promoCode) {

        promoResult =
          await promoStore.consumePromoInTransaction(
            client,
            promoCode,
            subtotal
          );


        if (
          !promoResult.valid
        ) {

          await client.query(
            "ROLLBACK"
          );

          return res.status(400).json({

            success: false,

            message:
            promoResult.reason

          });

        }


        discount =
          promoResult.discount;

        total =
          promoResult.total;

      }


      /*
       * ------------------------------------------------
       * 4b-2. "Сдача с какой суммы" (только доставка + наличные).
       *
       * Проверяем ТОЛЬКО ЗДЕСЬ, а не раньше — потому что до этого
       * момента total ещё не был честно посчитан сервером. Если
       * бы мы сверяли changeFrom с суммой, присланной клиентом,
       * это была бы точно такая же дыра, как с ценой товара:
       * можно было бы прислать total: 1 и changeFrom: 1 и пройти
       * проверку "changeFrom >= total" при совершенно другой
       * реальной сумме заказа.
       * ------------------------------------------------
       */
      if (
        fulfillmentResult.type === "delivery" &&
        paymentMethod === "cash"
      ) {

        const rawChangeFrom =
          body.payment?.changeFrom;


        /*
         * 0/null/undefined/"" — значит клиент вообще не указал
         * сумму (поле необязательное), это не ошибка.
         */
        if (
          rawChangeFrom !== null &&
          rawChangeFrom !== undefined &&
          Number(rawChangeFrom) !== 0
        ) {

          changeFrom =
            Number(rawChangeFrom);


          if (
            !Number.isFinite(changeFrom) ||
            changeFrom <= 0
          ) {

            await client.query(
              "ROLLBACK"
            );

            return res.status(400).json({

              success: false,

              message:
                "Некорректная сумма для сдачи."

            });

          }


          if (
            changeFrom < total
          ) {

            await client.query(
              "ROLLBACK"
            );

            return res.status(400).json({

              success: false,

              message:
                `Сумма для сдачи не может быть меньше суммы заказа ` +
                `(${formatMoney(total)}).`

            });

          }

        }

      }


      /*
       * ------------------------------------------------
       * 4c. Сохраняем заказ и его состав
       * ------------------------------------------------
       */
      insertedOrder =
        await ordersStore.insertOrder(
          client,
          {

            customerName:
            customerResult.name,

            customerPhone:
            customerResult.phone,

            deliveryType:
            fulfillmentResult.type,

            address:
              fulfillmentResult.type === "delivery"
                ? fulfillmentResult.address
                : null,

            totalAmount: total,

            discountAmount: discount,

            promocodeUsed:
              promoResult?.code || null

          }
        );


      await ordersStore.insertOrderItems(
        client,
        insertedOrder.id,
        orderItemsForMessage
      );


      await client.query(
        "COMMIT"
      );

    } catch (error) {

      try {

        await client.query(
          "ROLLBACK"
        );

      } catch (rollbackError) {

        console.error(
          "Ошибка при откате транзакции checkout:",
          rollbackError
        );

      }


      console.error(
        "Ошибка оформления заказа (транзакция откачена):",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Не удалось оформить заказ. " +
          "Попробуйте ещё раз или свяжитесь с магазином."

      });

    } finally {

      client.release();

    }


    /*
     * --------------------------------------------------
     * 5. Заказ УЖЕ надёжно сохранён в PostgreSQL —
     *    что бы ни случилось дальше с Telegram, заказ
     *    не потеряется. Поэтому отправку в Telegram
     *    делаем ПОСЛЕ commit и не роняем ответ клиенту,
     *    если Telegram недоступен.
     * --------------------------------------------------
     */
    const orderNumber =
      `SUSHI-${insertedOrder.id}`;

    const orderForMessage = {

      orderNumber,

      customer: {

        name: customerResult.name,

        phone: customerResult.phone

      },

      fulfillment: {

        type: fulfillmentResult.type,

        address: fulfillmentResult.address,

        apartment: fulfillmentResult.apartment,

        entrance: fulfillmentResult.entrance,

        comment: fulfillmentResult.comment

      },

      items:
        orderItemsForMessage.map(item => ({

          name: item.productName,

          price: item.unitPrice,

          quantity: item.quantity

        })),

      promo:
        promoResult
          ? { code: promoResult.code }
          : null,

      pricing: {

        subtotal,

        discount,

        total

      },

      payment: {

        method: paymentMethod,

        changeFrom

      }

    };


    try {

      await sendTelegramMessage(
        buildTelegramOrderMessage(
          orderForMessage
        )
      );

    } catch (telegramError) {

      /*
       * Заказ уже в БД — это не повод возвращать клиенту
       * ошибку. Просто громко логируем, чтобы админ
       * заметил и написал клиенту вручную.
       */
      console.error(
        `Заказ ${orderNumber} сохранён в БД, ` +
        "но не удалось отправить уведомление в Telegram:",
        telegramError
      );

    }


    /*
     * Дублируем заказ на почту — точно так же, независимо
     * от Telegram: заказ уже в БД, поэтому сбой отправки
     * письма не должен мешать ответу клиенту.
     */
    try {

      await emailNotifier.sendOrderEmail({

        subject:
          buildOrderEmailSubject(
            orderForMessage
          ),

        html:
          buildOrderEmailHtml(
            orderForMessage
          )

      });

    } catch (emailError) {

      console.error(
        `Заказ ${orderNumber} сохранён в БД, ` +
        "но не удалось отправить дубликат на почту:",
        emailError
      );

    }


    /*
     * --------------------------------------------------
     * 6. Ответ браузеру
     *
     * Номер заказа сюда специально не выводим — по просьбе
     * заказчика клиент просто видит "заказ оформлен",
     * без внутреннего идентификатора. Сам orderNumber
     * при этом никуда не делся: он есть в Telegram, в письме
     * на почту и в поле order.number ниже (на случай,
     * если он понадобится фронтенду в будущем).
     * --------------------------------------------------
     */
    return res.status(200).json({

      success: true,

      message:
        "Заказ успешно оформлен! Мы свяжемся с вами в ближайшее время и уточним цену доставки",

      order: {

        number: orderNumber,

        total

      }

    });

  }
);


/* ============================================================
   16. МЕНЮ САЙТА
   ============================================================ */


/*
 * GET /api/menu
 *
 * Отдаёт категории вместе с их активными товарами
 * (is_active = true). Это единственный источник товаров
 * и цен для витрины сайта — app.js должен рисовать меню
 * из ответа этого эндпоинта, а не из статического JS-файла.
 *
 * Ответ:
 * {
 *   success: true,
 *   categories: [
 *     {
 *       id, name, slug, sortOrder,
 *       products: [{ id, name, description, price, imageUrl }]
 *     },
 *     ...
 *   ]
 * }
 */
app.get(
  "/api/menu",
  async (req, res) => {

    try {

      const categories =
        await menuStore.getMenu();


      return res.json({

        success: true,

        categories

      });

    } catch (error) {

      console.error(
        "Ошибка /api/menu:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Не удалось загрузить меню."

      });

    }

  }
);


/* ============================================================
   17. HEALTH CHECK
   ============================================================ */


/*
 * Проверка, работает ли сервер И база данных.

 GET /api/health
 */
app.get(
  "/api/health",
  async (req, res) => {

    let databaseConnected =
      false;


    try {

      await db.checkConnection();

      databaseConnected = true;

    } catch (error) {

      console.error(
        "Health check: не удалось подключиться к БД:",
        error
      );

    }


    return res.json({

      success: true,

      status:
        databaseConnected
          ? "ok"
          : "degraded",

      service:
        "sushi-shop",

      time:
        new Date().toISOString(),

      databaseConnected,

      telegramConfigured:
        isTelegramConfigured()

    });

  }
);


/* ============================================================
   18. FALLBACK ДЛЯ FRONTEND
   ============================================================ */


/*
 * Если пользователь открыл неизвестный путь,
 * возвращаем index.html.

 Важно: API маршруты уже обработаны выше.
 */
/*
 * Если пользователь открыл неизвестный путь,
 * возвращаем index.html.

 Важно: API маршруты уже обработаны выше.

 Раньше здесь было app.get("*", ...) — в Express 5
 (path-to-regexp v6+) голая строка "*" в паттерне маршрута
 больше не поддерживается и роняет сервер прямо при старте
 ("Missing parameter name at index 1: *"). app.use без
 паттерна-строки — это просто middleware "на всё подряд",
 которое отработает и в Express 4, и в Express 5 одинаково.
 */
app.use(
  (req, res, next) => {

    if (
      req.method !== "GET"
    ) {

      return next();

    }


    /*
     * Не перехватываем API.
     */
    if (
      req.path.startsWith(
        "/api/"
      )
    ) {

      return next();

    }


    return res.sendFile(
      path.join(
        ROOT_DIR,
        "index.html"
      )
    );

  }
);


/* ============================================================
   19. 404 API
   ============================================================ */

app.use(
  "/api",
  (req, res) => {

    return res.status(404).json({

      success: false,

      message:
        "API endpoint не найден."

    });

  }
);


/* ============================================================
   20. ОБРАБОТЧИК ОШИБОК JSON
   ============================================================ */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    if (
      error instanceof
      SyntaxError &&
      error.status === 400 &&
      "body" in error
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Некорректный JSON."

      });

    }


    return next(
      error
    );

  }
);


/* ============================================================
   21. ГЛОБАЛЬНЫЙ ERROR HANDLER
   ============================================================ */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "Непредвиденная ошибка сервера:",
      error
    );


    if (
      res.headersSent
    ) {

      return next(
        error
      );

    }


    return res.status(500).json({

      success: false,

      message:
        "Внутренняя ошибка сервера."

    });

  }
);


/* ============================================================
   22. ЗАПУСК
   ============================================================ */

/*
 * Сервер теперь неотделим от БД: без PostgreSQL не работает
 * ни меню, ни чекаут, ни промокоды. Поэтому перед тем как
 * начать принимать запросы, мы:
 *
 * 1. Проверяем, что подключение к БД реально работает
 *    (понятная ошибка в консоли сразу, а не мутный стектрейс
 *    при первом же запросе от посетителя).
 * 2. Накатываем schema.sql (idempotent — CREATE TABLE IF NOT EXISTS).
 *
 * Если БД недоступна — сервер не запускается вообще, а не
 * стартует "наполовину рабочим".
 */
async function startServer() {

  try {

    await db.checkConnection();

    console.log(
      "✅ Подключение к PostgreSQL успешно."
    );


    await db.initSchema();

    console.log(
      "✅ Схема БД проверена/создана (schema.sql)."
    );

  } catch (error) {

    console.error(
      "❌ Не удалось подключиться к PostgreSQL или создать схему:"
    );

    console.error(
      error
    );

    console.error(
      "Проверьте PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE " +
      "(или DATABASE_URL) в .env, а также что сам PostgreSQL запущен."
    );

    process.exit(1);

  }


  app.listen(
    PORT,
    () => {

      console.log(
        ""
      );


      console.log(
        "=========================================="
      );


      console.log(
        "🍣 Sushi Shop Server"
      );


      console.log(
        "=========================================="
      );


      console.log(
        `🌐 http://localhost:${PORT}`
      );


      console.log(
        `🗄️  База данных: ${
          process.env.DATABASE_URL
            ? "по DATABASE_URL"
            : `${process.env.PGDATABASE || "sushi_shop"}@${process.env.PGHOST || "127.0.0.1"}`
        }`
      );


      console.log(
        `🤖 Telegram: ${
          isTelegramConfigured()
            ? "configured"
            : "NOT CONFIGURED"
        }`
      );


      console.log(
        `✉️  Email-дубликат заказа: ${
          emailNotifier.isEmailConfigured()
            ? "configured"
            : "NOT CONFIGURED"
        }`
      );


      console.log(
        "=========================================="
      );


      if (
        !isTelegramConfigured()
      ) {

        console.warn(
          ""
        );


        console.warn(
          "⚠️ Telegram Bot API не настроен."
        );


        console.warn(
          "Добавьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env."
        );


        console.warn(
          ""
        );

      }


      /*
       * Запускаем Telegram-бота управления промокодами и товарами
       * (long polling). Сам бот проверяет наличие токена
       * и админов и корректно выводит предупреждение,
       * если что-то не настроено — падать из-за этого
       * основной сервер не должен.
       */
      try {

        require("./promoBot").start();

      } catch (error) {

        console.error(
          "Не удалось запустить Telegram-бота управления:",
          error
        );

      }

    }
  );

}


startServer();
