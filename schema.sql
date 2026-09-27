-- ================================================================
--                          SCHEMA.SQL
--   Инициализация структуры базы данных суши-бара (PostgreSQL)
-- ================================================================
--
-- Запуск вручную:
--   psql -U sushi_user -d sushi_shop -f schema.sql
--
-- Либо автоматически при старте сервера — см. db.js (initSchema()),
-- который выполняет этот же файл через pool.query().
--
-- Скрипт идемпотентен (можно запускать повторно — таблицы
-- создаются только если их ещё нет).


-- ----------------------------------------------------------------
-- CATEGORIES — категории меню (Роллы, Суши, Напитки и т.д.)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
                                        id          SERIAL PRIMARY KEY,
                                        name        VARCHAR(150) NOT NULL,
  slug        VARCHAR(150) NOT NULL UNIQUE,
  sort_order  INT NOT NULL DEFAULT 0
  );


-- ----------------------------------------------------------------
-- PRODUCTS — товары (роллы, суши и т.д.)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
                                      id          SERIAL PRIMARY KEY,
                                      category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  image_url   VARCHAR(500),
  is_active   BOOLEAN NOT NULL DEFAULT true
  );

-- Ускоряет GET /api/menu (JOIN + фильтр по категории)
CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON products (category_id);

-- Ускоряет фильтр "только активные товары"
CREATE INDEX IF NOT EXISTS idx_products_is_active
  ON products (is_active);


-- ----------------------------------------------------------------
-- PROMOCODES — промокоды
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promocodes (
                                        id                SERIAL PRIMARY KEY,
                                        code              VARCHAR(50) NOT NULL UNIQUE,
  discount_type     VARCHAR(20) NOT NULL
  CHECK (discount_type IN ('percent', 'fixed')),
  discount_value    NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
  min_order_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  usage_limit       INT,                    -- NULL = без лимита
  times_used        INT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true
  );


-- ----------------------------------------------------------------
-- ORDERS — оформленные заказы
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
                                    id               SERIAL PRIMARY KEY,
                                    customer_name    VARCHAR(150) NOT NULL,
  customer_phone   VARCHAR(30) NOT NULL,
  delivery_type    VARCHAR(20) NOT NULL
  CHECK (delivery_type IN ('delivery', 'pickup')),
  address          TEXT,
  total_amount     NUMERIC(10, 2) NOT NULL,
  discount_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0,
  promocode_used   VARCHAR(50),
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );


-- ----------------------------------------------------------------
-- ORDER_ITEMS — состав заказа (СОСТАВ ЗАКАЗА ЗАКАЗА)
-- ----------------------------------------------------------------
--
-- ВАЖНО — этой таблицы не было в исходном ТЗ, добавил от себя:
--
-- Без неё в базе остаётся только ИТОГОВАЯ сумма заказа —
-- какие именно товары и в каком количестве заказал клиент,
-- нигде не сохраняется (кроме сообщения в Telegram, которое
-- рано или поздно "уедет" из истории чата). Через месяц
-- нельзя будет посчитать топ продаж или разобрать спорный заказ.
--
-- Если она не нужна — можно удалить этот блок и убрать
-- соответствующую вставку в server.js (см. комментарий
-- "order_items" в /api/checkout).
CREATE TABLE IF NOT EXISTS order_items (
                                         id           SERIAL PRIMARY KEY,
                                         order_id     INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INT REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(200) NOT NULL,  -- копия названия на момент заказа
  unit_price   NUMERIC(10, 2) NOT NULL, -- копия цены на момент заказа
  quantity     INT NOT NULL CHECK (quantity > 0)
  );

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items (order_id);


