export const LEVELS = ['Сад', 'Узбережжя', 'Сутінки', 'Космос', 'Перший фінал', 'Кришталева долина', 'Грозовий берег', 'Місячна станція', 'Зоряний шторм', 'Зоряний рубіж', 'Смарагдовий ліс', 'Піщані дюни', 'Кораловий риф', 'Вулканічний острів', 'Полярне сяйво', 'Небесне місто', 'Туманна галактика', 'Сонячна брама', 'Нескінченний обрій', 'Великий фінал'];
export const MAX_ARCADE_LEVEL = LEVELS.length;
export function arcadeUnlockedLevel(saved, wonFifth = false) {
  const level = Math.max(1, Math.min(MAX_ARCADE_LEVEL, Math.floor(Number(saved) || 1)));
  return level === 5 && wonFifth ? 6 : level;
}
