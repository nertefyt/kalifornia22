"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                          DB.JS                                ║
║        Подключение к PostgreSQL и инициализация схемы        ║
╚══════════════════════════════════════════════════════════════╝

Что делает:

1. Создаёт пул подключений (pg.Pool) к PostgreSQL.
2. Даёт остальным модулям (server.js, promoStore.js, menuStore.js,
   ordersStore.js, promoBot.js) два способа работать с БД:

   - query(text, params)      — для одиночных запросов
   - getClient()               — для транзакций (BEGIN/COMMIT/ROLLBACK),
                                  когда несколько запросов должны
                                  выполниться как одно целое
                                  (именно так устроен /api/checkout)

3. initSchema() — выполняет schema.sql (CREATE TABLE IF NOT EXISTS...),
   чтобы после `git clone` + `npm install` на новом сервере
   таблицы создавались одной командой, без ручного psql.


===============================================================
.env
===============================================================

Вариант 1 — отдельными параметрами:

PGHOST=127.0.0.1
PGPORT=5432
PGUSER=sushi_user
PGPASSWORD=super-secret-password
PGDATABASE=sushi_shop

Вариант 2 — одной строкой подключения (перекрывает вариант 1,
если задан DATABASE_URL):

DATABASE_URL=postgres://sushi_user:super-secret-password@127.0.0.1:5432/sushi_shop

Для управляемых БД в облаке (Yandex Cloud, Amazon RDS и т.п.)
почти всегда нужен SSL — включается через:

PGSSL=true

===============================================================
УСТАНОВКА
===============================================================

npm install pg

===============================================================
*/

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

/* ============================================================
   1. КОНФИГУРАЦИЯ ПОДКЛЮЧЕНИЯ
   ============================================================ */

const useSsl = String(process.env.PGSSL || "").toLowerCase() === "true";

/*
 * Раньше здесь были дефолты вида `process.env.PGUSER || "postgres"`.
 * Это плохая идея по двум причинам:
 *
 * 1. Если .env не подхватился (например, из-за неправильного
 *    порядка require — см. предупреждение в конце этого файла),
 *    приложение молча подключается ЧЕРНЫМ ХОДОМ к каким-то
 *    дефолтным логину/паролю вместо явной ошибки. Отладка такого
 *    "то работает, то нет" — отдельный вид боли.
 * 2. Дефолт — это соблазн вписать туда РЕАЛЬНЫЙ пароль "для
 *    удобства", чтобы всегда что-то подключалось. Тогда этот
 *    пароль оказывается прямо в коде — и в истории Git, если
 *    файл туда попал, и в любом чате/тикете, куда файл
 *    прикладывали.
 *
 * Поэтому здесь — никаких дефолтов для чувствительных данных:
 * либо все нужные переменные заданы в .env, либо приложение
 * падает сразу при старте с понятным сообщением, а не подключается
 * непонятно куда.
 */
function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false
    };
  }

  const requiredVars = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
  const missingVars = requiredVars.filter(name => !process.env[name]);

  if (missingVars.length > 0) {
    throw new Error(
      `db.js: не заданы переменные окружения для подключения к PostgreSQL: ${missingVars.join(", ")}.\n` +
      `Проверь, что файл .env лежит рядом с server.js и реально содержит эти переменные, ` +
      `и что dotenv.config() вызывается ДО require("./db") (см. комментарий в шапке server.js).`
    );
  }

  return {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  };
}

const poolConfig = buildPoolConfig();

/* ============================================================
   2. ПУЛ ПОДКЛЮЧЕНИЙ
   ============================================================ */

const pool = new Pool(poolConfig);

/*
 * Неожиданная ошибка на простаивающем клиенте пула
 * (например, PostgreSQL перезапустили) не должна ронять
 * весь процесс Node.js.
 */
pool.on("error", error => {
  console.error("PostgreSQL: неожиданная ошибка пула подключений:", error);
});

/* ============================================================
   3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
   ============================================================ */

/*
 * Обычный запрос через пул — подходит для большинства случаев,
 * когда не нужна транзакция из нескольких запросов подряд.
 */
function query(text, params) {
  return pool.query(text, params);
}

/*
 * Клиент "на руки" — нужен для транзакций.
 *
 * Использование:
 *
 *   const client = await db.getClient();
 *   try {
 *     await client.query("BEGIN");
 *     ...
 *     await client.query("COMMIT");
 *   } catch (error) {
 *     await client.query("ROLLBACK");
 *     throw error;
 *   } finally {
 *     client.release();
 *   }
 *
 * Не забывайте client.release() — иначе пул подключений
 * рано или поздно закончится.
 */
async function getClient() {
  return pool.connect();
}

/*
 * Инициализация схемы БД — выполняет schema.sql.
 *
 * Идемпотентна (CREATE TABLE IF NOT EXISTS), можно
 * безопасно вызывать при каждом старте сервера.
 */
async function initSchema() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  await pool.query(schemaSql);
}

/*
 * Проверка подключения к БД (для health-check и старта сервера).
 */
async function checkConnection() {
  const result = await pool.query("SELECT NOW() AS now");
  return result.rows[0].now;
}

module.exports = {
  pool,
  query,
  getClient,
  initSchema,
  checkConnection
};
