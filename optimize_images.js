"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                     OPTIMIZE-IMAGES.JS                         ║
║   Превращает JPG/PNG из папки images/ в лёгкие WebP.          ║
╚══════════════════════════════════════════════════════════════╝

Запуск (один раз, и потом после добавления новых картинок):

  node optimize-images.js

Что делает:
- обходит папку images/ (включая вложенные папки);
- для каждого .jpg/.jpeg/.png создаёт рядом файл с тем же именем
  и расширением .webp (philadelphia.jpg -> philadelphia.webp);
- уменьшает слишком большие картинки до 900 px по ширине (на сайте
  карточка показывается примерно в 300-450 px, 900 px хватает и для
  экранов с повышенной плотностью) и сжимает с качеством 80;
- ОРИГИНАЛЫ НЕ ТРОГАЕТ — они остаются как запасной вариант для
  старых браузеров;
- уже сконвертированные пропускает (если .webp новее оригинала),
  поэтому запускать повторно безопасно.

Сервер (server.js) сам отдаёт .webp вместо .jpg/.png тем браузерам,
которые его поддерживают, — в БД и в адресах картинок менять
ничего не нужно.

Установка: npm install sharp
*/

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const IMAGES_DIR = path.join(__dirname, "images");
const MAX_WIDTH = 900;
const QUALITY = 80;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(0)} КБ`;
}

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`Папка не найдена: ${IMAGES_DIR}`);
    process.exit(1);
  }

  let converted = 0;
  let skipped = 0;
  let savedBytes = 0;

  for (const file of walk(IMAGES_DIR)) {
    if (!/\.(jpe?g|png)$/i.test(file)) continue;

    const target = file.replace(/\.(jpe?g|png)$/i, ".webp");

    if (fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(file).mtimeMs) {
      skipped++;
      continue;
    }

    try {
      await sharp(file)
        .rotate() // учитываем ориентацию из EXIF (фото с телефона)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(target);

      const before = fs.statSync(file).size;
      const after = fs.statSync(target).size;

      // Если WebP вышел НЕ легче оригинала (бывает с уже сильно
      // сжатыми или очень маленькими картинками) — он бесполезен,
      // удаляем и оставляем только оригинал.
      if (after >= before) {
        fs.unlinkSync(target);
        skipped++;
        console.log(`↷ ${path.relative(IMAGES_DIR, file)}: WebP не легче оригинала (${formatKb(before)}) — оставляем как есть`);
        continue;
      }

      savedBytes += before - after;
      converted++;

      console.log(`✓ ${path.relative(IMAGES_DIR, file)}: ${formatKb(before)} → ${formatKb(after)}`);
    } catch (error) {
      console.error(`✗ ${path.relative(IMAGES_DIR, file)}: ${error.message}`);
    }
  }

  console.log(
    `\nГотово. Сконвертировано: ${converted}, пропущено (уже готово): ${skipped}, ` +
    `сэкономлено: ${formatKb(savedBytes)}.`
  );
}

main();
