"use strict";

/*
╔══════════════════════════════════════════════════════════════╗
║                          SEED.JS                               ║
║   Разовое наполнение БД стартовыми категориями и товарами.    ║
╚══════════════════════════════════════════════════════════════╝

Запуск:

  node seed.js

Внимание: скрипт полностью очищает текущие таблицы базы данных
(данные берутся из .env через модуль db.js) и заполняет их заново
актуальными данными из массива SEED_DATA.
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
        description: "Набор популярных роллов для небольшой компании",
        composition: "Капа мака, филадельфия, эби темпура, запеченный с беконом",
        weight: "920 г",
        price: 1550,
        imageUrl: "/img/min1.png"
      },
      {
        name: "Мини сет №3",
        description: "Сбалансированный набор с жареным лососем и темпурой",
        composition: "Шанхай, ролл с жаренным лососем, фуджи, лосось темпура",
        weight: "900 г",
        price: 1540,
        imageUrl: "/img/min3.png"
      },
      {
        name: "Сансет",
        description: "Большой сет для любителей классических и темпура роллов",
        composition: "Филадельфия лайт, бансай, лосось темпура, эби темпура, президент",
        weight: "1250 г",
        price: 1950,
        imageUrl: "/img/suns.png"
      },
      {
        name: "Хот",
        description: "Ассорти из горячих и запеченных роллов",
        composition: "Лосось темпура, запеченный с лососем, эби темпура, краб темпура, запеченный с креветкой",
        weight: "1340 г",
        price: 2000,
        imageUrl: "/img/hot.png"
      },
      {
        name: "Свидание",
        description: "Отличный вариант для уютного вечера вдвоем",
        composition: "Филадельфия, сяке маки, эби темпура, запеченный с крабом",
        weight: "1000 г",
        price: 1650,
        imageUrl: "/img/sv.png"
      },
      {
        name: "Макси",
        description: "Огромный сет для большой компании",
        composition: "Л.темпура, э.темпура, ф.лайт, чука, сяке маки, бансай, техас, калифорния с лососем, капа маки, к.лайт",
        weight: "2400 г",
        price: 3700,
        imageUrl: "/img/mx.png"
      },
      {
        name: "Вайб",
        description: "Яркий и разнообразный сет роллов",
        composition: "Филадельфия лайт, техас, президент, краб темпура, ролл с жаренным лососем, чука",
        weight: "1450 г",
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
        description: "Фирменный большой ролл с увеличенной порцией лосося",
        composition: "рис, нори, сливочный сыр, лосось",
        weight: "520 г | 1 штука",
        price: 1250,
        imageUrl: "/img/xxl.png"
      },
      {
        name: "Ролл «Филадельфия Лайт»",
        description: "Легкая версия классической Филадельфии",
        composition: "рис, нори, сливочный сыр, огурец, лосось",
        weight: "250 г",
        price: 530,
        imageUrl: "/img/philadelphia-light.png"
      },
      {
        name: "Ролл «Филадельфия»",
        description: "Классический вкус с нежным лососем и сливочным сыром",
        composition: "рис, нори, сливочный сыр, лосось",
        weight: "250 г",
        price: 680,
        imageUrl: "/img/philadelphia.png"
      },
      {
        name: "Ролл «Филадельфия де-люкс»",
        description: "Премиальная версия любимого ролла",
        composition: "рис, сливочный сыр, лосось",
        weight: "260 г",
        price: 950,
        imageUrl: "/img/philadelphia-deluxe.png"
      },
      {
        name: "Ролл «Филадельфия с тунцом»",
        description: "Альтернатива классике со свежим тунцом",
        composition: "рис, нори, сливочный сыр, тунец",
        weight: "250 г",
        price: 550,
        imageUrl: "/img/philadelphia-tuna.png"
      },
      {
        name: "Ролл «Канадский»",
        description: "Изысканный ролл с копченым угром и соусом унаги",
        composition: "рис, нори, сыр, сливочный сыр, огурец, угорь, соус унаги, кунжут",
        weight: "292 г",
        price: 760,
        imageUrl: "/img/canadian.png"
      },
      {
        name: "Ролл «Канадский Лайт»",
        description: "Облегченный вариант канадского ролла",
        composition: "рис, нори, сливочный сыр, огурец, угорь, соус унаги, кунжут",
        weight: "262 г",
        price: 550,
        imageUrl: "/img/canadian-light.png"
      },
      {
        name: "Ролл «Цезарь»",
        description: "Популярное сочетание ингредиентов в формате ролла",
        composition: "рис, нори, сливочный сыр, курица, томат",
        weight: "230 г",
        price: 370,
        imageUrl: "/img/cezar.png"
      },
      {
        name: "Ролл «Черная Калифорния с лососем»",
        description: "Эффектный ролл в черной икре тобико",
        composition: "рис, нори, сливочный сыр, огурец, лосось, икра",
        weight: "240 г",
        price: 620,
        imageUrl: "/img/black-california-salmon.png"
      },
      {
        name: "Ролл «Калифорния с лососем»",
        description: "Классическая Калифорния с лососем и икрой",
        composition: "рис, нори, сливочный сыр, огурец, лосось, икра",
        weight: "240 г",
        price: 620,
        imageUrl: "/img/california-salmon.png"
      },
      {
        name: "Ролл «Калифорния с креветкой»",
        description: "Нежный ролл с креветкой и авокадо",
        composition: "рис, нори, сливочный сыр, авокадо, креветка, икра",
        weight: "240 г",
        price: 620,
        imageUrl: "/img/california-shrimp.png"
      },
      {
        name: "Ролл «Черный лосось»",
        description: "Изысканный мини-ролл с лососем",
        composition: "рис, нори, лосось, икра",
        weight: "170 г",
        price: 600,
        imageUrl: "/img/black-salmon.png"
      },
      {
        name: "Ролл «Бостон»",
        description: "Сытный ролл с лососем, угрем и салатом Айсберг",
        composition: "рис, нори, сливочный сыр, лосось, угорь, салат Айсберг, икра",
        weight: "245 г",
        price: 620,
        imageUrl: "/img/boston.png"
      },
      {
        name: "Ролл «Сяке Маки»",
        description: "Простой и вкусный моно-ролл с лососем",
        composition: "рис, сливочный сыр, нори, лосось",
        weight: "200 г",
        price: 390,
        imageUrl: "/img/syake-maki.png"
      },
      {
        name: "Ролл «Чука»",
        description: "Полезный ролл с водорослями чука и ореховым соусом",
        composition: "рис, нори, сливочный сыр, чука, ореховый соус, кунжут",
        weight: "212 г",
        price: 300,
        imageUrl: "/img/chuka.png"
      },
      {
        name: "Ролл «Техас»",
        description: "Мясной ролл с курочкой и томатами",
        composition: "рис, нори, сливочный сыр, курица, помидор, кунжут",
        weight: "235 г",
        price: 350,
        imageUrl: "/img/texas.png"
      },
      {
        name: "Ролл «Бансай»",
        description: "Сытный ролл с беконом и овощами",
        composition: "рис, нори, сливочный сыр, огурец, томат, бекон",
        weight: "270 г",
        price: 400,
        imageUrl: "/img/bonsai.png"
      },
      {
        name: "Ролл «Бруклин»",
        description: "Оригинальное сочетание бекона и томатов",
        composition: "рис, нори, сливочный сыр, томат, бекон, кунжут",
        weight: "242 г",
        price: 380,
        imageUrl: "/img/brooklin.png"
      },
      {
        name: "Ролл «Капа Маки»",
        description: "Классический легкий ролл с огурцом",
        composition: "нори, рис, огурец",
        weight: "170 г",
        price: 200,
        imageUrl: "/img/kappa-maki.png"
      },
      {
        name: "Ролл «Фурай»",
        description: "Ролл с лососем и соусом унаги",
        composition: "рис, нори, сливочный сыр, лосось, огурец, соус унаги",
        weight: "240 г",
        price: 530,
        imageUrl: "/img/furai.png"
      },
      {
        name: "Ролл «Море креветок»",
        description: "Максимум креветок в одном ролле",
        composition: "рис, нори, сливочный сыр, креветка, двойная порция, унаги",
        weight: "230 г",
        price: 600,
        imageUrl: "/img/more-krevetok.png"
      },
      {
        name: "Ролл «Сырный цыпленок»",
        description: "Нежный ролл под аппетитной сырной шапочкой",
        composition: "рис, нори, сливочный сыр, лук, курица, сырная шапочка",
        weight: "260 г",
        price: 450,
        imageUrl: "/img/cheesy-chicken.png"
      },
      {
        name: "Ролл «Лава премиум»",
        description: "Премиальный вариант с креветкой и фирменным соусом",
        composition: "рис, нори, огурец, креветка, икра, майонез",
        weight: "220 г",
        price: 490,
        imageUrl: "/img/lava.png"
      },
      {
        name: "Ролл «Калифорния с угрем»",
        description: "Вариант Калифорнии с копченым угрем",
        composition: "рис, нори, сливочный сыр, огурец, угорь, соус унаги, кунжут",
        weight: "235 г",
        price: 550,
        imageUrl: "/img/california-eel.png"
      },
      {
        name: "Ролл «Президент»",
        description: "Пикантный ролл с тостерным сыром и острым майонезом",
        composition: "рис, нори, сливочный сыр, лук, тостерный сыр, острый майонез",
        weight: "230 г",
        price: 300,
        imageUrl: "/img/president.png"
      },
      {
        name: "Ролл «Имбирная креветка»",
        description: "Интересное сочетание креветки и пикантного имбиря",
        composition: "рис, нори, сливочный сыр, огурец, имбирь, креветка, соус унаги",
        weight: "260 г",
        price: 530,
        imageUrl: "/img/ginger-shrimp.png"
      },
      {
        name: "Ролл «Эби Филадельфия»",
        description: "Филадельфия с нежной креветкой",
        composition: "рис, нори, сливочный сыр, креветка, соус унаги",
        weight: "250 г",
        price: 560,
        imageUrl: "/img/ebi-philadelphia.png"
      },
      {
        name: "Ролл «Бонито»",
        description: "Ролл в ароматной стружке тунца",
        composition: "рис, нори, сливочный сыр, огурец, жареный лосось, стружка тунца",
        weight: "227 г",
        price: 400,
        imageUrl: "/img/bonito.png"
      },
      {
        name: "Ролл «Спайси лосось»",
        description: "Острый ролл с лососем и креветкой",
        composition: "рис, нори, сливочный сыр, авокадо, креветка, лосось, соус унаги, соус спайси, лук",
        weight: "270 г",
        price: 680,
        imageUrl: "/img/spicy-salmon.png"
      },
      {
        name: "Ролл «Криспи»",
        description: "Хрустящий ролл с карамелизированным луком и спайси соусом",
        composition: "сливочный сыр, жареный лосось, огурец, карамелизированный лук, спайси соус, унаги соус",
        weight: "230 г",
        price: 450,
        imageUrl: "/img/krispi.png"
      },
      {
        name: "Ролл «Ханнай»",
        description: "Изысканный ролл с лососем и черной тобико",
        composition: "сливочный сыр, авокадо, лосось, черная тобико",
        weight: "230 г",
        price: 620,
        imageUrl: "/img/hannai.png"
      },
      {
        name: "Ролл «Унаги Чиз»",
        description: "Сырный ролл с угром и рыжей тобико",
        composition: "сливочный сыр, угорь, рыжая тобико",
        weight: "210 г",
        price: 490,
        imageUrl: "/img/unagi-cheese.png"
      },
      {
        name: "Ролл «Филадельфия с креветкой»",
        description: "Комбинация лосося, тигровой креветки и сливочного сыра",
        composition: "лосось, креветка тигровая, сыр сливочный",
        weight: "270 г",
        price: 850,
        imageUrl: "/img/philadelphia-shrimp.png"
      },
      {
        name: "Ролл «Канадский премиум»",
        description: "Премиальный вариант канадского ролла с авокадо и угрем",
        composition: "сыр сливочный, лосось, авокадо, угорь, унаги соус, тобика рыжая",
        weight: "290 г",
        price: 1050,
        imageUrl: "/img/canadian-premium.png"
      },
      {
        name: "Ролл «Креветка-манго»",
        description: "Экзотический ролл с тигровой креветкой в панировке и манго",
        composition: "креветка тигровая в панировке, сыр сливочный, манго, авокадо, тобика рыжая",
        weight: "260 г",
        price: 550,
        imageUrl: "/img/shrimp-mango.png"
      },
      {
        name: "Ролл «Самурай»",
        description: "Нежное сочетание сливочного сыра, лосося и манго",
        composition: "сливочный сыр, лосось, манго",
        weight: "220 г",
        price: 530,
        imageUrl: "/img/samurai.png"
      },
      {
        name: "Ролл «Гейша»",
        description: "Сладкий десертный ролл с фруктами и шоколадным топингом",
        composition: "сладкий ролл, сливочный сыр, шоколадный блин, киви, груша, банан, шоколадный топинг",
        weight: "340 г",
        price: 660,
        imageUrl: "/img/geisha.png"
      },
      {
        name: "Ролл «Магуро Маки»",
        description: "Классический маки-ролл с нежным тунцом",
        composition: "тунец, рис, нори",
        weight: "130 г",
        price: 280,
        imageUrl: "/img/maguro-maki.png"
      },
      {
        name: "Ролл «Эби Маки»",
        description: "Классический маки-ролл с креветкой",
        composition: "креветка, рис, нори",
        weight: "130 г",
        price: 290,
        imageUrl: "/img/ebi-maki.png"
      },
      {
        name: "Ролл «Унаги Маки»",
        description: "Маки-ролл с копченым угрем и кунжутом",
        composition: "угорь, рис, кунжут, нори",
        weight: "135 г",
        price: 350,
        imageUrl: "/img/unagi-maki.png"
      },
      {
        name: "Ролл «Восток»",
        description: "Ролл с лососем и рыжей тобико в кунжуте",
        composition: "лосось, тобика рыжая, нори, рис, кунжут",
        weight: "135 г",
        price: 330,
        imageUrl: "/img/vostok.png"
      },
      {
        name: "Ролл «Калифорния в кунжуте»",
        description: "Калифорния с лососем, обвалянная в кунжуте",
        composition: "сыр, огурец, лосось, нори, рис, кунжут",
        weight: "230 г",
        price: 410,
        imageUrl: "/img/california-sesame.png"
      },
      {
        name: "Ролл «Япоша»",
        description: "Сытный ролл с лососем и креветкой под соусом спайси",
        composition: "сыр, томат, креветка, лосось, тобика рыжая, соус спайси",
        weight: "250 г",
        price: 520,
        imageUrl: "/img/yaposha.png"
      },
      {
        name: "Ролл «Чикен Голд»",
        description: "Ролл с курицей и двумя видами сыра",
        composition: "сыр, курица, тостерный сыр",
        weight: "220 г",
        price: 330,
        imageUrl: "/img/chicken-cheese.png"
      },
      {
        name: "Ролл «Чиз Кранч»",
        description: "Сырный ролл для любителей нежного вкуса",
        composition: "сыр тостерный, сыр творожный",
        weight: "180 г",
        price: 310,
        imageUrl: "/img/double-cheese.png"
      },
      {
        name: "Ролл «Санрайз Шримп»",
        description: "Ролл с креветкой, хрустящим салатом и рыжей тобико",
        composition: "тобика рыжая, салат айсберг, креветка, сыр творожный, рис, нори",
        weight: "210 г",
        price: 430,
        imageUrl: "/img/ebi-tobiko.png"
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
        description: "Горячий ролл под фирменным запеченным соусом со снежным крабом",
        composition: "рис, нори, огурец, снежный краб",
        weight: "270 г",
        price: 400,
        imageUrl: "/img/baked-crab.png"
      },
      {
        name: "Ролл «Запеченный с курицей»",
        description: "Сытный запеченный ролл с куриным филе",
        composition: "рис, нори, огурец, курица",
        weight: "240 г",
        price: 400,
        imageUrl: "/img/baked-chicken.png"
      },
      {
        name: "Ролл «Запеченный с угрем»",
        description: "Изысканный запеченный ролл с копченым угром",
        composition: "рис, нори, огурец, угорь",
        weight: "240 г",
        price: 500,
        imageUrl: "/img/baked-ug.png"
      },
      {
        name: "Ролл «Запеченный с креветкой»",
        description: "Запеченный ролл с сочной креветкой",
        composition: "нори, рис, огурец, креветка",
        weight: "250 г",
        price: 500,
        imageUrl: "/img/baked-shrimp.png"
      },
      {
        name: "Ролл «Запеченный с лососем»",
        description: "Классический запеченный ролл с кусочками лосося",
        composition: "рис, нори, огурец, лосось",
        weight: "250 г",
        price: 500,
        imageUrl: "/img/baked-salmon.png"
      },
      {
        name: "Ролл «Запеченный с тунцом»",
        description: "Запеченный ролл с нежным тунцом",
        composition: "нори, рис, огурец, тунец",
        weight: "250 г",
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
        description: "Хрустящий ролл в кляре темпура с тигровой креветкой",
        composition: "рис, нори, сливочный сыр, креветка, огурец, соус унаги",
        weight: "270 г",
        price: 420,
        imageUrl: "/img/ebi-tempura.png"
      },
      {
        name: "Ролл «Лосось темпура»",
        description: "Горячий хрустящий ролл с лососем",
        composition: "рис, нори, сливочный сыр, огурец, лосось",
        weight: "270 г",
        price: 440,
        imageUrl: "/img/salmon-tempura.png"
      },
      {
        name: "Ролл «Дабл креветка»",
        description: "Для любителей морепродуктов с двойной порцией креветки",
        composition: "рис, нори, сливочный сыр, огурец, двойная порция креветки",
        weight: "260 г",
        price: 560,
        imageUrl: "/img/double.png"
      },
      {
        name: "Ролл «Краб темпура»",
        description: "Темпура ролл со снежным крабом",
        composition: "рис, нори, сливочный сыр, огурец, снежный краб",
        weight: "280 г",
        price: 380,
        imageUrl: "/img/crab-tempura.png"
      },
      {
        name: "Ролл «Бонито темпура»",
        description: "Хрустящий темпура ролл с жареным лососем и стружкой тунца",
        composition: "рис, нори, сливочный сыр, огурец, жареный лосось, кляр, соус унаги, спайси соус, лук",
        weight: "310 г",
        price: 420,
        imageUrl: "/img/bonito-tempura.png"
      },
      {
        name: "Ролл «Унаги темпура»",
        description: "Горячий хрустящий ролл в кляре с копченым угрем",
        composition: "сыр, угорь, огурец",
        weight: "260 г",
        price: 460,
        imageUrl: "/img/unagi-tempura.png"
      },
      {
        name: "Ролл «Магуро хот»",
        description: "Горячий ролл с тунцом и сыром",
        composition: "сыр, тунец, огурец",
        weight: "260 г",
        price: 410,
        imageUrl: "/img/maguro-hot.png"
      },
      {
        name: "Ролл «Сливочный с лососем»",
        description: "Жареный ролл с лососем и сливочным сыром",
        composition: "лосось, сыр сливочный, сыр тостерный",
        weight: "210 г",
        price: 420,
        imageUrl: "/img/creamy-salmon.png"
      },
      {
        name: "Ролл «Сашики»",
        description: "Жареный ролл с двойной порцией креветки",
        composition: "двойная порция креветки, сливочный сыр, тобика",
        weight: "270 г",
        price: 520,
        imageUrl: "/img/sashiki.png"
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
        description: "Японский рисовый треугольник с начинкой из лосося",
        composition: "рис, нори, лосось, лист салата, томат, острый соус, унаги соус",
        weight: "200 г",
        price: 380,
        imageUrl: "/img/onigiri-salmon.png"
      },
      {
        name: "Онигири с курицей",
        description: "Сытный онигири с куриным филе и сыром",
        composition: "рис, нори, курица, сыр, томат, унаги соус",
        weight: "210 г",
        price: 380,
        imageUrl: "/img/onigiri-ch.png"
      },
      {
        name: "Онигири с угрем",
        description: "Онигири с копченым угром и пикантным соусом",
        composition: "рис, нори, угорь, лист салата, томат, острый соус, унаги соус",
        weight: "200 г",
        price: 380,
        imageUrl: "/img/onigiri-ug.png"
      },
      {
        name: "Онигири с креветкой",
        description: "Онигири с сочной креветкой и овощами",
        composition: "рис, нори, креветка, томат, лист салата, острый соус, унаги соус",
        weight: "200 г",
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
        description: "Хрустящий золотистый картофель фри",
        composition: "картофель, специи",
        weight: "200 г",
        price: 180,
        imageUrl: "/img/french-fries.png"
      },
      {
        name: "Наггетсы",
        description: "Сочные куриные наггетсы в хрустящей панировке",
        composition: "куриное филе, панировка",
        weight: "7 штук",
        price: 250,
        imageUrl: "/img/nuggets.png"
      },
      {
        name: "Эби Фурай",
        description: "Хрустящие креветки в панировке",
        composition: "креветка в панировке",
        weight: "160 г",
        price: 660,
        imageUrl: "/img/ebi-furai.png"
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
        description: "Традиционный острый тайский суп с креветками и грибами",
        composition: "рис (отдельно в судочке), бульон, креветка, шампиньоны, черри, кинза",
        weight: "350 г",
        price: 560,
        imageUrl: "/img/tom-yum-shrimp.png"
      },
      {
        name: "Том ям с курицей",
        description: "Традиционный острый тайский суп с курицей и грибами",
        composition: "рис (отдельно в судочке), бульон, курица, шампиньоны, черри, кинза",
        weight: "350 г",
        price: 460,
        imageUrl: "/img/tom-yum-chicken.png"
      }
    ]
  },
  // =========================
  // ДЕСЕРТЫ
  // =========================
  {
    name: "Десерты",
    slug: "desserts",
    sortOrder: 9,
    products: [
      {
        name: "Манго спринг ролл",
        description: "Сладкий хрустящий ролл с манго и шоколадным топингом",
        composition: "сладкий сыр, манго, спринг тесто, шоколадный топинг",
        weight: "170 г",
        price: 370,
        imageUrl: "/img/mango-spring-roll.png"
      },
      {
        name: "Спринг ролл с бананом и шоколадом",
        description: "Сладкий хрустящий ролл с бананом и шоколадным топингом",
        composition: "спринг тесто, сладкий сыр, банан, шоколадный топинг",
        weight: "170 г",
        price: 330,
        imageUrl: "/img/banana-spring-roll.png"
      }
    ]
  }
];


async function seed() {
  console.log("🗑️ Очищаем старые данные базы данных...\n");

  await db.initSchema();

  // Полная очистка таблиц продуктов и категорий перед заполнением
  // CASCADE гарантирует корректную работу со связями внешних ключей
  await db.pool.query("TRUNCATE TABLE products, categories RESTART IDENTITY CASCADE;");
  console.log("✓ Таблицы успешно очищены.\n");

  console.log("🌱 Наполняем базу новыми данными...\n");

  for (const categoryData of SEED_DATA) {
    const result = await menuStore.addCategory({
      name: categoryData.name,
      slug: categoryData.slug,
      sortOrder: categoryData.sortOrder
    });

    if (!result.success) {
      console.error(`✗ Не удалось создать категорию "${categoryData.name}": ${result.reason}`);
      continue;
    }

    const category = result.category;
    console.log(`✓ Создана категория "${category.name}" (id ${category.id})`);

    for (const productData of categoryData.products) {
      const productResult = await menuStore.addProduct({
        categoryId: category.id,
        name: productData.name,
        description: productData.description,
        composition: productData.composition,
        weight: productData.weight,
        price: productData.price,
        imageUrl: productData.imageUrl
      });

      if (productResult.success) {
        console.log(`  ✓ Добавлен товар "${productData.name}" — ${productData.price}₽`);
      } else {
        console.error(`  ✗ Не удалось добавить товар "${productData.name}": ${productResult.reason}`);
      }
    }
  }

  console.log("\n🌱 База данных успешно очищена и заполнена заново.");

  await db.pool.end();
}

seed().catch(error => {
  console.error("Ошибка при очистке и наполнении БД:", error);
  process.exit(1);
});
