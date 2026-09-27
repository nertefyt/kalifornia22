"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                      EMAILNOTIFIER.JS                          ║
║   Дублирование заказа на почту админа/магазина (nodemailer). ║
╚══════════════════════════════════════════════════════════════╝

Работает независимо от Telegram-уведомления: если не настроен
или упал email — заказ всё равно в БД и уведомление в Telegram
(если он настроен) уйдёт своим чередом, и наоборот.

===============================================================
УСТАНОВКА
===============================================================

npm install nodemailer

===============================================================
.env
===============================================================

# Куда дублировать заказы (можно указать несколько через запятую)
ORDER_NOTIFY_EMAIL=owner@example.com

# SMTP-сервер, через который отправляем письма.
# Пример для Яндекс.Почты:
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=shop@yandex.ru
SMTP_PASSWORD=пароль-приложения
# necessarily From может отличаться от SMTP_USER только если
# почтовый провайдер это разрешает — для большинства сервисов
# оставь такой же, как SMTP_USER.
SMTP_FROM=shop@yandex.ru

Для Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_SECURE=false,
и вместо обычного пароля — "пароль приложения" (App Password),
обычный пароль аккаунта Google для SMTP не подойдёт.

Если ORDER_NOTIFY_EMAIL или любая из SMTP_* переменных не задана —
отправка email просто тихо пропускается (см. isEmailConfigured),
сервер и чекаут при этом продолжают работать как обычно.

===============================================================
*/

const nodemailer = require("nodemailer");

const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASSWORD = String(process.env.SMTP_PASSWORD || "").trim();
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || "").trim();

/*
 * Можно указать несколько адресов через запятую —
 * например, владельцу и менеджеру одновременно.
 */
const ORDER_NOTIFY_EMAILS = String(process.env.ORDER_NOTIFY_EMAIL || "")
  .split(",")
  .map(email => email.trim())
  .filter(Boolean);

function isEmailConfigured() {
  return Boolean(
    SMTP_HOST &&
    SMTP_USER &&
    SMTP_PASSWORD &&
    ORDER_NOTIFY_EMAILS.length > 0
  );
}

/*
 * Транспорт создаём один раз и переиспользуем — так nodemailer
 * может держать соединение с SMTP открытым между письмами,
 * а не пересоздавать его на каждый заказ.
 */
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE, // true для порта 465, false для 587/25 (там используется STARTTLS)
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD
      }
    });
  }

  return transporter;
}

/*
 * Отправка письма-дубликата заказа.
 *
 * { subject, html, text } — text это запасной вариант для
 * почтовых клиентов, которые не показывают HTML.
 */
async function sendOrderEmail({ subject, html, text }) {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email-уведомления не настроены " +
      "(проверь SMTP_HOST/SMTP_USER/SMTP_PASSWORD/ORDER_NOTIFY_EMAIL в .env)."
    );
  }

  const mailer = getTransporter();

  await mailer.sendMail({
    from: SMTP_FROM,
    to: ORDER_NOTIFY_EMAILS.join(", "),
    subject,
    html,
    text
  });
}

module.exports = {
  isEmailConfigured,
  sendOrderEmail
};
