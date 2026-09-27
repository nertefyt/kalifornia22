"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                          SEED.JS                               ║
║   Разовое наполнение БД стартовыми категориями и товарами.    ║
╚══════════════════════════════════════════════════════════════╝

Запуск:

  node seed.js

Скрипт безопасно пропускает категории/товары, которые уже
существуют (по slug категории), поэтому его можно запускать
повторно, не боясь задублировать данные.

Отредактируй массив SEED_DATA ниже под реальное меню перед
запуском на боевом сервере — здесь только пример структуры.
*/

require("dotenv").config();

const db = require("./db");
const menuStore = require("./menuStore");

const SEED_DATA = [
  {
    name: "Сеты",
    slug: "sets",
    sortOrder: 1,
    products: [
      {
        name: "Мини сет №1",
        description: "Капа мака, филадельфия, эби темпура, запеченный с беконом | 920 г",
        price: 1550,
        imageUrl: "/img/min1.png"
      },
      {
        name: "Мини сет №3",
        description: "Шанхай, ролл с жаренным лососем, фуджи, лосось темпура | 900 г",
        price: 1540,
        imageUrl: "/img/min3.png"
      },
      {
        name: "Сансет",
        description: "Филадельфия лайт, бансай, лосось темпура, эби темпура, президент | 1250 г",
        price: 1950,
        imageUrl: "/img/suns.png"
      },
      {
        name: "Хот",
        description: "Лосось темпура, запеченный с лососем, эби темпура, краб темпура, запеченный с креветкой | 1340 г",
        price: 2000,
        imageUrl: "/img/hot.png"
      },
      {
        name: "Свидание",
        description: "Филадельфия, сяке маки, эби темпура, запеченный с крабом | 1000 г",
        price: 1650,
        imageUrl: "/img/sv.png"
      },
      {
        name: "Макси",
        description: "Л.темпура,э.темпура,ф.лайт,чука,сяке маки,бансай,техас,калифорния с лососем,\n" +
          "капа маки,к.лайт | 2400 г",
        price: 3700,
        imageUrl: "/img/mx.png"
      },
      {
        name: "Вайб",
        description: "Филадельфия лайт, техас, президент, краб темпура, ролл с жаренным лососем, чука | 1450 г",
        price: 2100,
        imageUrl: "/img/vaib.png"
      }
    ]
  },

  // =========================
  // КЛАССИЧЕСКИЕ РОЛЛЫ
  // =========================
  {
    name: "Классические роллы",
    slug: "classic-rolls",
    sortOrder: 2,
    products: [
      {
        name: "Ролл «Филадельфия XXL»",
        description: "Состав: рис, нори, сливочный сыр, лосось | 520 г",
        price: 1250,
        imageUrl: "/img/xxl.png"
      },
      {
        name: "Ролл «Дабл креветка»",
        description: "Состав: рис, нори, сливочный сыр, огурец, двойная порция креветки | 260 г",
        price: 560,
        imageUrl: "/img/double.png"
      },
      {
        name: "Ролл «Филадельфия Лайт»",
        description: "Состав: рис, нори, сливочный сыр, огурец, лосось | 250 г",
        price: 530,
        imageUrl: "/img/philadelphia-light.png"
      },
      {
        name: "Ролл «Филадельфия»",
        description: "Состав: рис, нори, сливочный сыр, лосось | 250 г",
        price: 680,
        imageUrl: "/img/philadelphia.png"
      },
      {
        name: "Ролл «Филадельфия де-люкс»",
        description: "Состав: рис, сливочный сыр, лосось | 260 г",
        price: 950,
        imageUrl: "/img/philadelphia-deluxe.png"
      },
      {
        name: "Ролл «Филадельфия с тунцом»",
        description: "Состав: рис, нори, сливочный сыр, тунец | 250 г",
        price: 550,
        imageUrl: "/img/philadelphia-tuna.png"
      },
      {
        name: "Ролл «Канадский»",
        description: "Состав: рис, нори, сыр, сливочный сыр, огурец, угорь, соус унаги, кунжут | 292 г",
        price: 760,
        imageUrl: "/img/canadian.png"
      },
      {
        name: "Ролл «Канадский Лайт»",
        description: "Состав: рис, нори, сливочный сыр, огурец, угорь, соус унаги, кунжут | 262 г",
        price: 550,
        imageUrl: "/img/canadian-light.png"
      },
      {
        name: "Ролл «Цезарь»",
        description: "Состав: рис, нори, сливочный сыр, курица, томат | 230 г",
        price: 370,
        imageUrl: "/img/cezar.png"
      },
      {
        name: "Ролл «Черная Калифорния с лососем»",
        description: "Состав: рис, нори, сливочный сыр, огурец, лосось, икра | 240 г",
        price: 620,
        imageUrl: "/img/black-california-salmon.png"
      },
      {
        name: "Ролл «Калифорния с лососем»",
        description: "Состав: рис, нори, сливочный сыр, огурец, лосось, икра | 240 г",
        price: 620,
        imageUrl: "/img/california-salmon.png"
      },
      {
        name: "Ролл «Калифорния с креветкой»",
        description: "Состав: рис, нори, сливочный сыр, авокадо, креветка, икра | 240 г",
        price: 620,
        imageUrl: "/img/california-shrimp.png"
      },
      {
        name: "Ролл «Черный лосось»",
        description: "Состав: рис, нори, лосось, икра | 170 г",
        price: 600,
        imageUrl: "/img/black-salmon.png"
      },
      {
        name: "Ролл «Бостон»",
        description: "Состав: рис, нори, сливочный сыр, лосось, угорь, салат Айсберг, икра | 245 г",
        price: 620,
        imageUrl: "/img/boston.png"
      },
      {
        name: "Ролл «Сяке Маки»",
        description: "Состав: рис, сливочный сыр, нори, лосось | 200 г",
        price: 390,
        imageUrl: "/img/syake-maki.png"
      },
      {
        name: "Ролл «Чука»",
        description: "Состав: рис, нори, сливочный сыр, чука, ореховый соус, кунжут | 212 г",
        price: 300,
        imageUrl: "/img/chuka.png"
      },
      {
        name: "Ролл «Техас»",
        description: "Состав: рис, нори, сливочный сыр, курица, помидор, кунжут | 235 г",
        price: 350,
        imageUrl: "/img/texas.png"
      },
      {
        name: "Ролл «Бансай»",
        description: "Состав: рис, нори, сливочный сыр, огурец, томат, бекон | 270 г",
        price: 400,
        imageUrl: "/img/bonsai.png"
      },
      {
        name: "Ролл «Бруклин»",
        description: "Состав: рис, нори, сливочный сыр, томат, бекон, кунжут | 242 г",
        price: 380,
        imageUrl: "/img/brooklin.png"
      },
      {
        name: "Ролл «Капа Маки»",
        description: "Состав: нори, рис, огурец | 170 г",
        price: 200,
        imageUrl: "/img/kappa-maki.png"
      },
      {
        name: "Ролл «Фурай»",
        description: "Состав: рис, нори, сливочный сыр, лосось, огурец, соус унаги | 240 г",
        price: 530,
        imageUrl: "/img/furai.png"
      },
      {
        name: "Ролл «Море креветок»",
        description: "Состав: рис, нори, сливочный сыр, креветка, двойная порция, унаги | 230 г",
        price: 600,
        imageUrl: "/img/more-krevetok.png"
      },
      {
        name: "Ролл «Сырный цыпленок»",
        description: "Состав: рис, нори, сливочный сыр, лук, курица, сырная шапочка | 260 г",
        price: 450,
        imageUrl: "/img/cheesy-chicken.png"
      },
      {
        name: "Ролл «Лава премиум»",
        description: "Состав: рис, нори, огурец, креветка, икра, майонез | 220 г",
        price: 490,
        imageUrl: "/img/lava.png"
      },
      {
        name: "Ролл «Калифорния с угрем»",
        description: "Состав: рис, нори, сливочный сыр, огурец, угорь, соус унаги, кунжут | 235 г",
        price: 550,
        imageUrl: "/img/california-eel.png"
      },
      {
        name: "Ролл «Президент»",
        description: "Состав: рис, нори, сливочный сыр, лук, тостерный сыр, острый майонез | 230 г",
        price: 300,
        imageUrl: "/img/president.png"
      },
      {
        name: "Ролл «Имбирная креветка»",
        description: "Состав: рис, нори, сливочный сыр, огурец, имбирь, креветка, соус унаги | 260 г",
        price: 530,
        imageUrl: "/img/ginger-shrimp.png"
      },
      {
        name: "Ролл «Эби Филадельфия»",
        description: "Состав: рис, нори, сливочный сыр, креветка, соус унаги | 250 г",
        price: 560,
        imageUrl: "/img/ebi-philadelphia.png"
      },
      {
        name: "Ролл «Бонито»",
        description: "Состав: рис, нори, сливочный сыр, огурец, жареный лосось, стружка тунца | 227 г",
        price: 400,
        imageUrl: "/img/bonito.png"
      },
      {
        name: "Ролл «Спайси лосось»",
        description: "Состав: рис, нори, сливочный сыр, авокадо, креветка, лосось, соус унаги, соус спайси, лук | 270 г",
        price: 680,
        imageUrl: "/img/spicy-salmon.png"
      },
      {
        name: "Ролл «Криспи»",
        description: "Состав: сливочный сыр, жареный лосось, огурец, карамелизированный лук, спайси соус, унаги соус | 230 г",
        price: 450,
        imageUrl: "/img/krispi.png"
      },
      {
        name: "Ролл «Ханнай»",
        description: "Состав: сливочный сыр, авокадо, лосось, черная тобико | 230 г",
        price: 620,
        imageUrl: "/img/hannai.png"
      },
      {
        name: "Ролл «Унаги Чиз»",
        description: "Состав: сливочный сыр, угорь, рыжая тобико | 210 г",
        price: 490,
        imageUrl: "/img/unagi-cheese.png"
      },
      {
        name: "Ролл «Филадельфия с креветкой»",
        description: "Состав: лосось, креветка тигровая, сыр сливочный | 270 г",
        price: 850,
        imageUrl: "/img/philadelphia-shrimp.png"
      },
      {
        name: "Ролл «Канадский премиум»",
        description: "Состав: сыр сливочный, лосось, авокадо, угорь, унаги соус, тобика рыжая | 290 г",
        price: 1050,
        imageUrl: "/img/canadian-premium.png"
      },
      {
        name: "Ролл «Креветка-манго»",
        description: "Состав: креветка тигровая в панировке, сыр сливочный, манго, авокадо, тобика рыжая | 260 г",
        price: 550,
        imageUrl: "/img/shrimp-mango.png"
      },
      {
        name: "Ролл «Самурай»",
        description: "Состав: сливочный сыр, лосось, манго | 220 г",
        price: 530,
        imageUrl: "/img/samurai.png"
      },
      {
        name: "Ролл «Гейша»",
        description: "Состав: сладкий ролл, сливочный сыр, шоколадный блин, киви, груша, банан, шоколадный топинг | 340 г",
        price: 660,
        imageUrl: "/img/geisha.png"
      }
    ]
  },

  // =========================
  // ЗАПЕЧЁННЫЕ РОЛЛЫ
  // =========================
  {
    name: "Запечённые роллы",
    slug: "baked-rolls",
    sortOrder: 3,
    products: [
      {
        name: "Ролл «Запеченный с крабом»",
        description: "Состав: рис, нори, огурец, снежный краб | 270 г",
        price: 400,
        imageUrl: "/img/baked-crab.png"
      },
      {
        name: "Ролл «Запеченный с курицей»",
        description: "Состав: рис, нори, огурец, курица | 240 г",
        price: 400,
        imageUrl: "/img/baked-chicken.png"
      },
      {
        name: "Ролл «Запеченный с угрем»",
        description: "Состав: рис, нори, огурец, угорь | 240 г",
        price: 500,
        imageUrl: "/img/baked-ug.png"
      },
      {
        name: "Ролл «Запеченный с креветкой»",
        description: "Состав: нори, рис, огурец, креветка | 250 г",
        price: 500,
        imageUrl: "/img/baked-shrimp.png"
      },
      {
        name: "Ролл «Запеченный с лососем»",
        description: "Состав: рис, нори, огурец, лосось | 250 г",
        price: 500,
        imageUrl: "/img/baked-salmon.png"
      },
      {
        name: "Ролл «Запеченный с тунцом»",
        description: "Состав: нори, рис, огурец, тунец | 250 г",
        price: 500,
        imageUrl: "/img/baked-tuna.png"
      }
    ]
  },

  // =========================
  // ТЕМПУРА
  // =========================
  {
    name: "Темпура",
    slug: "tempura",
    sortOrder: 4,
    products: [
      {
        name: "Ролл «Эби темпура»",
        description: "Состав: рис, нори, сливочный сыр, креветка, огурец, соус унаги | 270 г",
        price: 420,
        imageUrl: "/img/ebi-tempura.png"
      },
      {
        name: "Ролл «Лосось темпура»",
        description: "Состав: рис, нори, сливочный сыр, огурец, лосось | 270 г",
        price: 440,
        imageUrl: "/img/salmon-tempura.png"
      },
      {
        name: "Ролл «Краб темпура»",
        description: "Состав: рис, нори, сливочный сыр, огурец, снежный краб | 280 г",
        price: 380,
        imageUrl: "/img/crab-tempura.png"
      },
      {
        name: "Ролл «Бонито темпура»",
        description: "Состав: рис, нори, сливочный сыр, огурец, жареный лосось, кляр, соус унаги, спайси соус, лук | 310 г",
        price: 420,
        imageUrl: "/img/bonito-tempura.png"
      }
    ]
  },

  // =========================
  // ОНИГИРИ
  // =========================
  {
    name: "Онигири",
    slug: "onigiri",
    sortOrder: 5,
    products: [
      {
        name: "Онигири с лососем",
        description: "Состав: рис, нори, лосось, лист салата, томат, острый соус, унаги соус | 200 г",
        price: 380,
        imageUrl: "/img/onigiri-salmon.png"
      },
      {
        name: "Онигири с курицей",
        description: "Состав: рис, нори, курица, сыр, томат, унаги соус | 210 г",
        price: 380,
        imageUrl: "/img/onigiri-ch.png"
      },
      {
        name: "Онигири с угрем",
        description: "Состав: рис, нори, угорь, лист салата, томат, острый соус, унаги соус | 200 г",
        price: 380,
        imageUrl: "/img/onigiri-ug.png"
      },
      {
        name: "Онигири с креветкой",
        description: "Состав: рис, нори, креветка, томат, лист салата, острый соус, унаги соус | 200 г",
        price: 380,
        imageUrl: "/img/onigiri-shrimp.png"
      }
    ]
  },

  // =========================
  // ЗАКУСКИ
  // =========================
  {
    name: "Закуски",
    slug: "snack",
    sortOrder: 6,
    products: [
      {
        name: "Картофель фри",
        description: "200 г",
        price: 180,
        imageUrl: "/img/french-fries.png"
      },
      {
        name: "Наггетсы",
        description: "7 штук",
        price: 250,
        imageUrl: "/img/nuggets.png"
      }
    ]
  },

  // =========================
  // СУПЫ
  // =========================
  {
    name: "Супы",
    slug: "soups",
    sortOrder: 7,
    products: [
      {
        name: "Том ям с креветкой",
        description: "Состав: рис (отдельно в судочке), бульон, креветка, шампиньоны, черри, кинза | 350 г",
        price: 560,
        imageUrl: "/img/tom-yum-shrimp.png"
      },
      {
        name: "Том ям с курицей",
        description: "Состав: рис (отдельно в судочке), бульон, курица, шампиньоны, черри, кинза | 350 г",
        price: 460,
        imageUrl: "/img/tom-yum-chicken.png"
      }
    ]
  }
];


async function seed() {
  console.log("🌱 Наполняем базу стартовыми данными...\n");

  await db.initSchema();

  for (const categoryData of SEED_DATA) {
    let category = await menuStore.findCategoryBySlug(categoryData.slug);

    if (category) {
      console.log(`↷ Категория "${categoryData.name}" уже существует, пропускаем создание.`);
    } else {
      const result = await menuStore.addCategory({
        name: categoryData.name,
        slug: categoryData.slug,
        sortOrder: categoryData.sortOrder
      });

      if (!result.success) {
        console.error(`✗ Не удалось создать категорию "${categoryData.name}": ${result.reason}`);
        continue;
      }

      category = result.category;
      console.log(`✓ Создана категория "${category.name}" (id ${category.id})`);
    }

    const existingProducts = await menuStore.listProducts();

    for (const productData of categoryData.products) {
      const alreadyExists = existingProducts.some(
        product =>
          product.categoryId === category.id &&
          product.name === productData.name
      );

      if (alreadyExists) {
        console.log(`  ↷ Товар "${productData.name}" уже существует, пропускаем.`);
        continue;
      }

      const result = await menuStore.addProduct({
        categoryId: category.id,
        name: productData.name,
        description: productData.description,
        price: productData.price,
        imageUrl: productData.imageUrl
      });

      if (result.success) {
        console.log(`  ✓ Добавлен товар "${productData.name}" — ${productData.price}₽`);
      } else {
        console.error(`  ✗ Не удалось добавить товар "${productData.name}": ${result.reason}`);
      }
    }
  }

  console.log("\n🌱 Готово.");

  await db.pool.end();
}

seed().catch(error => {
  console.error("Ошибка при наполнении БД:", error);
  process.exit(1);
});
