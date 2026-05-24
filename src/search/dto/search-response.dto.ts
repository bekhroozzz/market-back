import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Product document ─────────────────────────────────────────────────────────

export class AttributeEntryResponseDto {
  @ApiProperty({ example: 'color', description: 'Ключ атрибута' })
  key: string;

  @ApiProperty({ example: 'Space Gray', description: 'Значение атрибута' })
  value: string;
}

export class ProductDocumentDto {
  @ApiProperty({
    example: 'f3d87fc5-9dcf-489f-aaf7-1ddf9c1e28b1',
    description: 'UUID из PostgreSQL offers.id',
  })
  id: string;

  @ApiProperty({
    example: 'Apple iPhone 15 Pro 256GB',
    description: 'Название товара',
  })
  title: string;

  @ApiProperty({
    example: 'apple-iphone-15-pro-256gb',
    nullable: true,
    description: 'URL-slug',
  })
  slug: string | null;

  @ApiProperty({
    example: 'Смартфон с процессором A17 Pro, Pro-камерой 48 Мп...',
    description: 'Описание товара',
  })
  description: string;

  @ApiProperty({
    example: [
      'd290f1ee-6c54-4b01-90e6-d701748f0851',
      'a1b2c3d4-0000-0000-0000-000000000000',
    ],
    description:
      'Все ancestor-категории включая прямую. ' +
      'Позволяет фильтровать по родительской категории и получать все подкатегории.',
    type: [String],
  })
  categoryIds: string[];

  @ApiProperty({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    nullable: true,
    description: 'UUID бренда',
  })
  brandId: string | null;

  @ApiProperty({
    type: [AttributeEntryResponseDto],
    description: 'Атрибуты товара (цвет, размер, материал и т.д.)',
  })
  attributes: AttributeEntryResponseDto[];

  @ApiProperty({ example: 89900, nullable: true, description: 'Цена продажи' })
  price: number | null;

  @ApiProperty({
    example: 99900,
    nullable: true,
    description: 'Цена до скидки',
  })
  oldPrice: number | null;

  @ApiProperty({ example: true, description: 'В наличии' })
  inStock: boolean;

  @ApiProperty({ example: 4.8, description: 'Средний рейтинг 0–5' })
  rating: number;

  @ApiProperty({ example: 142, description: 'Количество продаж' })
  salesCount: number;

  @ApiProperty({
    example: '2025-06-13T15:30:00.000Z',
    description: 'Дата создания (ISO 8601)',
  })
  createdAt: string;
}

// ─── Search hit ───────────────────────────────────────────────────────────────

export class HighlightDto {
  @ApiPropertyOptional({
    example: ['Apple <mark>iPhone 15</mark> Pro'],
    type: [String],
    description: 'Полный title с тегами <mark> вокруг совпавших слов',
  })
  title?: string[];

  @ApiPropertyOptional({
    example: ['Смартфон с процессором A17 Pro, <mark>камера</mark> 48 Мп...'],
    type: [String],
    description: 'До 2 сниппетов из description (150 символов) с тегами <mark>',
  })
  description?: string[];
}

export class ProductHitDto {
  @ApiProperty({
    type: () => ProductDocumentDto,
    description: 'Документ товара из OpenSearch',
  })
  document: ProductDocumentDto;

  @ApiProperty({
    example: 3.14,
    description:
      'Релевантность (_score). ' +
      'Зависит от текстового совпадения, рейтинга, продаж, наличия и новизны.',
  })
  score: number;

  @ApiPropertyOptional({
    type: () => HighlightDto,
    description:
      'HTML-снипеты с тегами <mark> вокруг совпавших терминов. ' +
      'Присутствует только при текстовом запросе (q ≠ пусто).',
  })
  highlight?: HighlightDto;
}

// ─── Facets ───────────────────────────────────────────────────────────────────

export class BrandFacetDto {
  @ApiProperty({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description: 'UUID бренда',
  })
  id: string;

  @ApiProperty({
    example: 38,
    description: 'Количество товаров с этим брендом',
  })
  count: number;
}

export class CategoryFacetDto {
  @ApiProperty({
    example: 'a1b2c3d4-0000-0000-0000-000000000001',
    description: 'UUID категории',
  })
  id: string;

  @ApiProperty({
    example: 24,
    description: 'Количество товаров в этой категории',
  })
  count: number;
}

export class AttributeValueFacetDto {
  @ApiProperty({ example: 'Space Gray' })
  value: string;

  @ApiProperty({
    example: 12,
    description: 'Количество товаров с этим значением',
  })
  count: number;
}

export class AttributeFacetDto {
  @ApiProperty({ example: 'color', description: 'Ключ атрибута' })
  key: string;

  @ApiProperty({ type: [AttributeValueFacetDto] })
  values: AttributeValueFacetDto[];
}

export class PriceRangeFacetDto {
  @ApiProperty({
    example: '1000_5000',
    description:
      'Ключ диапазона: under_1000 | 1000_5000 | 5000_15000 | 15000_50000 | over_50000',
  })
  key: string;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Нижняя граница (включительно)',
  })
  from?: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Верхняя граница (исключительно)',
  })
  to?: number;

  @ApiProperty({ example: 56, description: 'Количество товаров в диапазоне' })
  count: number;
}

export class PriceStatsFacetDto {
  @ApiProperty({
    example: 199,
    description: 'Минимальная цена среди найденных товаров',
  })
  min: number;

  @ApiProperty({ example: 299900, description: 'Максимальная цена' })
  max: number;

  @ApiProperty({ example: 34750, description: 'Средняя цена' })
  avg: number;

  @ApiProperty({ example: 142, description: 'Количество товаров с ценой' })
  count: number;
}

export class SearchFacetsDto {
  @ApiProperty({
    type: [BrandFacetDto],
    description:
      'Топ-50 брендов с количеством товаров. Используется для фильтра по бренду.',
  })
  brands: BrandFacetDto[];

  @ApiProperty({
    type: [CategoryFacetDto],
    description:
      'Топ-50 категорий с количеством товаров. ' +
      'Включает все ancestor-категории (не только прямые).',
  })
  categories: CategoryFacetDto[];

  @ApiProperty({
    type: PriceStatsFacetDto,
    description: 'Статистика цен для слайдера диапазона цен.',
  })
  priceStats: PriceStatsFacetDto;

  @ApiProperty({
    type: [PriceRangeFacetDto],
    description:
      'Предустановленные ценовые диапазоны для кнопок быстрого фильтра.',
  })
  priceRanges: PriceRangeFacetDto[];

  @ApiProperty({
    type: [AttributeFacetDto],
    description:
      'Динамические атрибуты (цвет, размер, материал и т.д.). ' +
      'Используется для построения панели фильтров.',
  })
  attributes: AttributeFacetDto[];
}

// ─── Main search response ─────────────────────────────────────────────────────

export class SearchResponseDto {
  @ApiProperty({
    example: 142,
    description: 'Общее количество найденных документов (до пагинации)',
  })
  total: number;

  @ApiProperty({ example: 1, description: 'Текущая страница (1-based)' })
  page: number;

  @ApiProperty({ example: 20, description: 'Элементов на странице' })
  limit: number;

  @ApiProperty({
    example: 8,
    description: 'Всего страниц = ceil(total / limit)',
  })
  pages: number;

  @ApiProperty({
    type: [ProductHitDto],
    description: 'Товары на текущей странице',
  })
  items: ProductHitDto[];

  @ApiProperty({
    type: SearchFacetsDto,
    description: 'Агрегации для построения панели фильтров на фронтенде',
  })
  facets: SearchFacetsDto;

  @ApiProperty({
    example: 12,
    description: 'Время выполнения запроса в OpenSearch (мс)',
  })
  took: number;
}

// ─── Autocomplete response ────────────────────────────────────────────────────

export class AutocompleteSuggestionDto {
  @ApiProperty({ example: 'f3d87fc5-9dcf-489f-aaf7-1ddf9c1e28b1' })
  id: string;

  @ApiProperty({ example: 'Apple iPhone 15 Pro Max 256GB' })
  title: string;

  @ApiProperty({
    example: 'apple-iphone-15-pro-max-256gb',
    nullable: true,
    description: 'URL-slug для формирования ссылки на товар',
  })
  slug: string | null;

  @ApiProperty({
    example: 129900,
    nullable: true,
    description: 'Цена для отображения в выпадающем списке',
  })
  price: number | null;
}

export class AutocompleteResponseDto {
  @ApiProperty({
    type: [AutocompleteSuggestionDto],
    description: 'Список подсказок (максимум определяется параметром size)',
  })
  suggestions: AutocompleteSuggestionDto[];

  @ApiProperty({
    example: 3,
    description: 'Время выполнения запроса в OpenSearch (мс)',
  })
  took: number;
}

// ─── Reindex response ─────────────────────────────────────────────────────────

export class ReindexResponseDto {
  @ApiProperty({
    example: 1542,
    description: 'Успешно проиндексировано документов',
  })
  indexed: number;

  @ApiProperty({ example: 0, description: 'Документов с ошибкой индексации' })
  errors: number;

  @ApiProperty({
    example: 4820,
    description: 'Время выполнения реиндекса (мс)',
  })
  durationMs: number;
}
