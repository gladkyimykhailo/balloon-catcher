import { EXPANSION_MECHANICS } from './expansion-catalog.js';
// 40 mechanics × 5 rule sets × 5 contracts = 1,000 playable combinations.
// IDs and their meanings are persistent: saves and achievements refer to them.
export const MECHANICS = [
  ...EXPANSION_MECHANICS,
  { id: 'arithmetic', name: 'Майстер чисел', icon: '🧮', category: 'logic', help: 'Обчисли вираз і вибери правильну відповідь.', scenes: ['Крамниця сум', 'Фабрика різниць', 'Млин добутків', 'Пекарня часток', 'Міст дужок'] },
  { id: 'fraction', name: 'Частини цілого', icon: '🍰', category: 'logic', help: 'Порівнюй дроби. Вибери частку, яку просить завдання.', scenes: ['Великий шматок', 'Маленький шматок', 'Половина пирога', 'Рівні частки', 'Відсоткове кафе'] },
  { id: 'clockwork', name: 'Вартовий часу', icon: '🕰️', category: 'logic', help: 'Прочитай стрілки годинника й вибери час.', scenes: ['Ранковий вокзал', 'Квартал чвертей', 'П’ятихвилинний експрес', 'Година потому', 'Пів години тому'] },
  { id: 'cipher', name: 'Шифрувальник', icon: '🔐', category: 'logic', help: 'Розшифруй запис за підказкою над відповідями.', scenes: ['Двійкова брама', 'Римська бібліотека', 'Зсув абетки', 'Дзеркальний запис', 'Таємна сума'] },
  { id: 'balance', name: 'Ювелірні ваги', icon: '⚖️', category: 'logic', help: 'Знайди невідому вагу, щоб урівноважити терези.', scenes: ['Один кристал', 'Два кристали', 'Три кристали', 'Зайва гиря', 'Подвійна шалька'] },
  { id: 'sequence-lab', name: 'Майстер закономірностей', icon: '🧬', category: 'logic', help: 'Знайди наступне число в послідовності.', scenes: ['Сходи чисел', 'Зворотні сходи', 'Подвоєний сад', 'Квадратна алея', 'Ритм додавання'] },
  { id: 'color-lab', name: 'Фарби навпаки', icon: '🌈', category: 'attention', help: 'Уважно читай завдання: колір напису й значення слова можуть відрізнятися.', scenes: ['Колір чорнила', 'Значення слова', 'Зайва фарба', 'Палітра сумішей', 'Колір рамки'] },
  { id: 'rotation', name: 'Компас мандрівника', icon: '🧭', category: 'logic', help: 'Поверни стрілку подумки й вибери кінцевий напрямок.', scenes: ['Правий поворот', 'Лівий поворот', 'Півоберт', 'Подвійний маневр', 'Зворотний компас'] },
  { id: 'wordsmith', name: 'Майстер слів', icon: '🔤', category: 'logic', help: 'Виконай мовне завдання й обери слово або літеру.', scenes: ['Переплутані літери', 'Перша літера', 'Остання літера', 'Лічильник літер', 'Загублена літера'] },
  { id: 'quantity', name: 'Окомір', icon: '🔎', category: 'attention', help: 'Порахуй потрібні фігури. Колір і форма мають значення.', scenes: ['Зоряний перепис', 'Червоні вогники', 'Трикутний ліс', 'Парні сузір’я', 'Різниця фігур'] },
  { id: 'recall', name: 'Атлас пам’яті', icon: '🗺️', category: 'memory', help: 'Запам’ятай показані символи. Після закриття картки дай відповідь.', scenes: ['Перший знак', 'Останній знак', 'Середній знак', 'Знак-сусід', 'Відсутній знак'] },
  { id: 'cups', name: 'Таємниця скриньок', icon: '🥥', category: 'memory', help: 'Стеж за позначеною скринькою під час обмінів, потім вибери її номер.', scenes: ['Один обмін', 'Подвійна підміна', 'Потрійний обмін', 'Довгий маршрут', 'Зворотний пошук'] },
  { id: 'reaction', name: 'Світлофор', icon: '🚦', category: 'reflex', help: 'Дочекайся потрібного сигналу й натисни «Дія». Завчасне натискання — помилка.', scenes: ['Зелене світло', 'Синій сигнал', 'Другий спалах', 'Тихий інтервал', 'Коротке вікно'] },
  { id: 'rhythm', name: 'Ритм-машина', icon: '🥁', category: 'reflex', help: 'Натискай «Дія», коли нота перетинає світлу смугу.', scenes: ['Прямий біт', 'Зворотний біт', 'Прискорений біт', 'Пружний біт', 'Вузький біт'] },
  { id: 'orbit', name: 'Орбітальна пошта', icon: '🪐', category: 'reflex', help: 'Запусти посилку кнопкою «Дія», коли супутник у золотому секторі.', scenes: ['Перша орбіта', 'Зворотна орбіта', 'Мандрівна станція', 'Пульсуючий двигун', 'Точне стикування'] },
  { id: 'dial', name: 'Майстер замків', icon: '🔓', category: 'reflex', help: 'Зупини рухомий покажчик у зеленій зоні кнопкою «Дія».', scenes: ['Мідний замок', 'Лівий механізм', 'Блукаючий зубець', 'Нерівний хід', 'Тонка засувка'] },
  { id: 'catcher', name: 'Парашутна доставка', icon: '🪂', category: 'reflex', help: 'Рухай кошик стрілками або пальцем. «Дія» ловить посилку, коли вона поруч із кошиком.', scenes: ['Тиха доставка', 'Східний вітер', 'Західний вітер', 'Маятниковий вантаж', 'Мала посадкова зона'] },
  { id: 'aim', name: 'Фотополювання', icon: '📸', category: 'reflex', help: 'Наведи приціл стрілками або дотиком і сфотографуй рухомий об’єкт кнопкою «Дія» чи кліком.', scenes: ['Лісова стежка', 'Високий політ', 'Круговий маршрут', 'Зигзаг у траві', 'Маленький метелик'] },
  { id: 'sorting', name: 'Поштова сортувальна', icon: '📮', category: 'attention', help: 'Обирай кошик стрілками або дотиком. Підтверди «Дія», перш ніж посилка доїде до краю.', scenes: ['Колір посилки', 'Форма печатки', 'Парне чи непарне', 'Адреса на етикетці', 'Перехресна адреса'] },
  { id: 'tracker', name: 'Світлячкова стежка', icon: '✨', category: 'reflex', help: 'Тримай приціл на світлячку стрілками або пальцем, поки кільце не заповниться.', scenes: ['Пряма стежка', 'Вертикальна стежка', 'Коловий танок', 'Хвиля над озером', 'Крихітний світляк'] },
];

export const CONTRACTS = [
  { id: 'expedition', name: 'Експедиція', help: 'Збери потрібну кількість успіхів. Є 3 життя.', target: 8 },
  { id: 'streak', name: 'Ланцюжок', help: 'Збери серію успіхів без помилки. Помилка обнуляє серію.', target: 5 },
  { id: 'blitz', name: 'Хвилинний виклик', help: 'Виконай ціль за 60 секунд.', target: 7, limit: 60 },
  { id: 'survival', name: 'Вахта', help: 'Протримайся 45 секунд і виконай ціль. Після виконання цілі гра триває до кінця часу.', target: 5, limit: 45 },
  { id: 'perfect', name: 'Кришталева спроба', help: 'Одна помилка завершує гру.', target: 6, lives: 1 },
];

export const CATEGORIES = { logic: 'Логіка й числа', attention: 'Уважність', memory: 'Пам’ять', reflex: 'Реакція та рух' };
export const ANTHOLOGY_GAMES = Object.fromEntries(MECHANICS.flatMap(mechanic =>
  mechanic.scenes.flatMap((scene, rule) => CONTRACTS.map(contract => [
    `discovery-${mechanic.id}-${rule}-${contract.id}`,
    { anthology: true, mechanic: mechanic.id, rule, contract: contract.id, category: mechanic.category, collection: mechanic.collection || 'first',
      timeBonus: mechanic.id === 'orbit' ? 9 : 4,
      name: `${mechanic.icon} ${scene} · ${contract.name}`,
      help: `${mechanic.help} ${mechanic.id === 'orbit' ? contract.help.replace('4 секунди', '9 секунд') : contract.help}`, summary: `${mechanic.name} · ${contract.name}` },
  ])),
));

export function selectCatalog(games, { query = '', category = '', mechanic = '', collection = '', variants = false } = {}) {
  const words = query.trim().toLocaleLowerCase('uk').split(/\s+/).filter(Boolean);
  return Object.entries(games).filter(([id, info]) =>
    (!info.base || variants) && (!category || (category === 'classic' ? !info.anthology : info.category === category)) &&
    (!mechanic || info.mechanic === mechanic) && (!collection || info.collection === collection) && words.every(word => `${info.name} ${info.help} ${info.summary || ''} ${id}`.toLocaleLowerCase('uk').includes(word)));
}
