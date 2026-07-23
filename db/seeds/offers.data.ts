import { categoriesData } from './categories.data';

export interface OfferSeedAttribute {
  key: string;
  value: string;
}

export interface OfferSeedInput {
  title: string;
  description: string;
  images: string[];
  price: number;
  oldPrice: number;
  inStock: boolean;
  attributes: OfferSeedAttribute[];
  branchAddress: string;
  categoryName: string;
}

const PACKAGE_TYPES = [
  'базовый пакет',
  'стандартный пакет',
  'пакет "под ключ"',
  'премиум пакет',
  'экспресс-организация',
  'семейный формат',
  'корпоративный формат',
];

const DELIVERY_FORMATS = [
  'выездная команда',
  'работа на площадке заказчика',
  'гибридный формат',
  'онлайн + офлайн сопровождение',
];

const TEAM_SIZES = ['2 человека', '3 человека', '4 человека', '5 человек'];

const PREP_TIMELINES = ['7 дней', '10 дней', '14 дней', '21 день', '30 дней'];

const BRANCH_ADDRESSES = [
  'г. Алматы, пр. Абая, 28',
  'г. Астана, пр. Мангилик Ел, 35',
  'г. Шымкент, ул. Кунаева, 14',
  'г. Караганда, пр. Бухар Жырау, 51',
  'г. Актобе, ул. Абулхаир хана, 73',
  'г. Павлодар, ул. Торайгырова, 19',
  'г. Костанай, ул. Баймагамбетова, 162',
  'г. Усть-Каменогорск, пр. Назарбаева, 67',
  'г. Атырау, ул. Сатпаева, 8',
  'г. Тараз, пр. Толе би, 102',
];

const IMAGE_COLLECTIONS = [
  [
    'https://images.unsplash.com/photo-1511795409834-ef04bbd61622',
    'https://images.unsplash.com/photo-1519225421980-715cb0215aed',
  ],
  [
    'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3',
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2',
  ],
  [
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30',
    'https://images.unsplash.com/photo-1527529482837-4698179dc6ce',
  ],
  [
    'https://images.unsplash.com/photo-1530103862676-de8c9debad1d',
    'https://images.unsplash.com/photo-1528605248644-14dd04022da1',
  ],
];

const HIGH_BUDGET_KEYWORDS = [
  'Свадьбы',
  'Корпоративы',
  'Конференции и семинары',
  'Рестораны и банкетные залы',
  'Видеотрансляция и стриминг',
];

const MID_BUDGET_KEYWORDS = [
  'Юбилеи',
  'Выпускные',
  'Музыкальные группы',
  'Артисты и шоу-программы',
  'Световое оформление',
  'Видеографы',
  'Открытые площадки',
];

const childCategoryNames = [
  ...new Set(
    categoriesData.flatMap((parentCategory) =>
      (parentCategory.children ?? []).map((childCategory) => childCategory.name),
    ),
  ),
];

function normalizePrice(value: number): number {
  return Math.max(5000, Math.round(value / 500) * 500);
}

function resolvePriceRange(categoryName: string): [number, number] {
  if (HIGH_BUDGET_KEYWORDS.some((keyword) => categoryName.includes(keyword))) {
    return [120000, 980000];
  }

  if (MID_BUDGET_KEYWORDS.some((keyword) => categoryName.includes(keyword))) {
    return [60000, 420000];
  }

  return [25000, 220000];
}

function makeDescription(
  categoryName: string,
  packageType: string,
  prepTimeline: string,
): string {
  return `Профессиональные услуги категории "${categoryName}" в формате "${packageType}". Берем на себя планирование, коммуникацию с подрядчиками и контроль качества на каждом этапе. Средний срок подготовки — ${prepTimeline}.`;
}

function makeAttributes(index: number, packageType: string): OfferSeedAttribute[] {
  return [
    { key: 'Формат', value: DELIVERY_FORMATS[index % DELIVERY_FORMATS.length] },
    { key: 'Команда', value: TEAM_SIZES[index % TEAM_SIZES.length] },
    { key: 'Подготовка', value: PREP_TIMELINES[index % PREP_TIMELINES.length] },
    { key: 'Пакет', value: packageType },
  ];
}

function makeTitle(categoryName: string, packageType: string, index: number): string {
  const districtToken = index % BRANCH_ADDRESSES.length;
  return `${categoryName} — ${packageType} (${districtToken + 1})`;
}

export const offersData: OfferSeedInput[] = Array.from(
  { length: 100 },
  (_, index): OfferSeedInput => {
    const categoryName = childCategoryNames[index % childCategoryNames.length];
    const packageType = PACKAGE_TYPES[index % PACKAGE_TYPES.length];
    const [minPrice, maxPrice] = resolvePriceRange(categoryName);
    const spread = maxPrice - minPrice;
    const price = normalizePrice(minPrice + ((index * 17311) % spread));
    const oldPrice = normalizePrice(Math.max(price + 2500, price * 1.12));
    const imageSet = IMAGE_COLLECTIONS[index % IMAGE_COLLECTIONS.length];

    return {
      categoryName,
      title: makeTitle(categoryName, packageType, index),
      description: makeDescription(
        categoryName,
        packageType,
        PREP_TIMELINES[index % PREP_TIMELINES.length],
      ),
      images: imageSet.map(
        (url, imageIndex) =>
          `${url}?seed=${index + 1}-${imageIndex + 1}&w=1280&q=80&fm=webp&fit=crop`,
      ),
      price,
      oldPrice,
      inStock: index % 11 !== 0,
      attributes: makeAttributes(index, packageType),
      branchAddress: BRANCH_ADDRESSES[index % BRANCH_ADDRESSES.length],
    };
  },
);
