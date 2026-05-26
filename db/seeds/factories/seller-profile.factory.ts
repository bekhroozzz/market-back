import { faker } from '@faker-js/faker/locale/ru';
import {
  Branch,
  GalleryImage,
} from '../../../src/seller-profile/entities/seller-profile.entity';

export interface SellerProfileSeedData {
  companyName: string;
  aboutCompany: string;
  phones: string[];
  branches: Branch[];
  gallery: GalleryImage[];
}

const COMPANY_PREFIXES = ['ТОО', 'ИП', 'ООО'];

const COMPANY_NAMES = [
  'ТехноМир',
  'EventPro',
  'PhotoArt',
  'CateringKZ',
  'MusicWorld',
  'АстанаСервис',
];

const ABOUT_TEMPLATES = [
  'Профессиональная команда с {years} годами опыта в организации мероприятий в Казахстане.',
  'Предоставляем полный спектр услуг для корпоративных и частных мероприятий с {year} года.',
  'Мы берём на себя всё: от концепции до реализации. Более {events} успешных проектов.',
  'Современный подход к организации праздников. Работаем по всему Казахстану.',
  'Команда профессионалов, которая сделает ваш праздник незабываемым и уникальным.',
  'Качество, пунктуальность, творческий подход — наши главные принципы с {year} года.',
];

const CITY_DATA = [
  { city: 'Алматы', street: 'пр. Абая', lat: 43.238949, lng: 76.889709 },
  { city: 'Астана', street: 'пр. Мангилик Ел', lat: 51.180409, lng: 71.445598 },
  { city: 'Шымкент', street: 'ул. Кунаева', lat: 42.316962, lng: 69.595913 },
  { city: 'Алматы', street: 'ул. Достык', lat: 43.234567, lng: 76.945678 },
  { city: 'Астана', street: 'ул. Кенесары', lat: 51.169876, lng: 71.467543 },
  { city: 'Шымкент', street: 'пр. Республики', lat: 42.325431, lng: 69.612345 },
];

const GALLERY_URLS = [
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622',
  'https://images.unsplash.com/photo-1519225421980-715cb0215aed',
  'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3',
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30',
];

function buildAbout(index: number): string {
  const template = ABOUT_TEMPLATES[index % ABOUT_TEMPLATES.length];
  return template
    .replace('{years}', String(3 + (index % 8)))
    .replace('{year}', String(2015 + (index % 8)))
    .replace('{events}', String(50 + index * 11));
}

export function makeSellerProfile(sellerIndex: number): SellerProfileSeedData {
  faker.seed(sellerIndex + 2000); // deterministic per seller

  const cityData = CITY_DATA[sellerIndex % CITY_DATA.length];
  const prefix = COMPANY_PREFIXES[sellerIndex % COMPANY_PREFIXES.length];
  const name = COMPANY_NAMES[sellerIndex % COMPANY_NAMES.length];

  const branches: Branch[] = [
    {
      title: 'Главный офис',
      address: `г. ${cityData.city}, ${cityData.street}, ${10 + sellerIndex * 3}`,
      latitude: cityData.lat + sellerIndex * 0.001,
      longitude: cityData.lng + sellerIndex * 0.001,
    },
  ];

  const gallery: GalleryImage[] = GALLERY_URLS.slice(0, 2).map((url, imgIdx) => ({
    id: `gallery-${sellerIndex}-${imgIdx + 1}`,
    url: `${url}?seed=${sellerIndex + 1}-${imgIdx + 1}`,
  }));

  return {
    companyName: `${prefix} «${name}»`,
    aboutCompany: buildAbout(sellerIndex),
    phones: [
      `+77010${String(sellerIndex).padStart(6, '0')}`,
      `+77270${String(sellerIndex).padStart(6, '0')}`,
    ],
    branches,
    gallery,
  };
}
