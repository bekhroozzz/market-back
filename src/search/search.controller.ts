import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchProductsDto, SortOption } from './dto/search-products.dto';
import { AutocompleteDto } from './dto/autocomplete.dto';
import {
  AttributeEntryResponseDto,
  AttributeFacetDto,
  AttributeValueFacetDto,
  AutocompleteResponseDto,
  AutocompleteSuggestionDto,
  BrandFacetDto,
  CategoryFacetDto,
  HighlightDto,
  PriceRangeFacetDto,
  PriceStatsFacetDto,
  ProductDocumentDto,
  ProductHitDto,
  ReindexResponseDto,
  SearchFacetsDto,
  SearchResponseDto,
} from './dto/search-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../user/enums/role.enum';

@ApiTags('Search')
@Controller('search')
// Регистрируем все вложенные DTO-классы в схемах Swagger
@ApiExtraModels(
  SearchResponseDto,
  ProductHitDto,
  ProductDocumentDto,
  AttributeEntryResponseDto,
  HighlightDto,
  SearchFacetsDto,
  BrandFacetDto,
  CategoryFacetDto,
  PriceStatsFacetDto,
  PriceRangeFacetDto,
  AttributeFacetDto,
  AttributeValueFacetDto,
  AutocompleteResponseDto,
  AutocompleteSuggestionDto,
  ReindexResponseDto,
)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // ─── GET /api/search/products ─────────────────────────────────────────────

  /**
   * Полнотекстовый поиск по каталогу.
   *
   * Текстовый запрос и все фильтры объединяются в **один** OpenSearch-запрос.
   * Каждый параметр независим — можно использовать любую комбинацию.
   *
   * Пример запроса:
   * GET /api/search/products?q=iphone+15&brand=UUID&minPrice=50000&inStock=true&sort=price_asc
   */
  @Get('products')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Поиск товаров',
    description: `
Полнотекстовый поиск с поддержкой фильтров, сортировки и фасетных агрегаций.

**Движок:** OpenSearch (не SQL LIKE).

**Ранжирование** (применяется совместно):
- Текстовая релевантность: title × 4–5, description × 1
- Точная фраза ранжируется выше fuzzy-совпадений
- Товары в наличии получают вес ×1.5
- Популярные товары (salesCount) поднимаются через sqrt-фактор
- Рейтинг влияет на итоговый score
- Новые товары имеют небольшой буст через gauss-decay (30 дней)

**Typo tolerance:** fuzziness AUTO (0/1/2 ошибки в зависимости от длины слова)

**Фасеты** (aggregations) возвращаются всегда — используются для построения панели фильтров на фронтенде.
    `.trim(),
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    example: 'iphone 15 pro',
    description:
      'Поисковый запрос. Поддерживает: русский и английский, опечатки (fuzziness AUTO), ' +
      'частичные слова, stemming. Если не указан — возвращает все товары.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Номер страницы (1-based). По умолчанию: 1.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Элементов на странице. Диапазон: 1–100. По умолчанию: 20.',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: SortOption,
    example: SortOption.RELEVANCE,
    description: `Сортировка результатов:
- \`relevance\` — по релевантности (учитывает популярность, рейтинг, наличие)
- \`price_asc\` — сначала дешевле
- \`price_desc\` — сначала дороже
- \`newest\` — сначала новые
- \`popularity\` — по количеству продаж`,
  })
  @ApiQuery({
    name: 'category',
    required: false,
    type: String,
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description:
      'UUID категории. Автоматически включает все дочерние категории ' +
      '(используются все ancestor-IDs в индексе).',
  })
  @ApiQuery({
    name: 'brand',
    required: false,
    type: String,
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description: 'UUID бренда. Точный match по полю brandId.',
  })
  @ApiQuery({
    name: 'minPrice',
    required: false,
    type: Number,
    example: 10000,
    description:
      'Минимальная цена (включительно). Работает совместно с maxPrice.',
  })
  @ApiQuery({
    name: 'maxPrice',
    required: false,
    type: Number,
    example: 100000,
    description:
      'Максимальная цена (включительно). Работает совместно с minPrice.',
  })
  @ApiQuery({
    name: 'inStock',
    required: false,
    type: Boolean,
    example: true,
    description:
      'Если true — показывать только товары с inStock=true. ' +
      'Если не указан — показывать все.',
  })
  @ApiQuery({
    name: 'attributes[color]',
    required: false,
    type: String,
    example: 'Space Gray',
    description:
      'Фильтр по атрибуту. Формат: `attributes[key]=value`. ' +
      'Несколько значений одного ключа: `attributes[color]=red&attributes[color]=blue` (OR внутри ключа). ' +
      'Разные ключи комбинируются через AND. ' +
      'Примеры: `attributes[color]=red`, `attributes[size]=XL`, `attributes[storage]=256GB`.',
  })
  @ApiOkResponse({
    description: 'Результаты поиска с фасетными агрегациями',
    type: SearchResponseDto,
  })
  async searchProducts(
    @Query() dto: SearchProductsDto,
  ): Promise<SearchResponseDto> {
    return this.searchService.searchProducts(dto);
  }

  // ─── GET /api/search/products/autocomplete ────────────────────────────────

  /**
   * Поисковые подсказки при вводе текста.
   *
   * Оптимизирован для latency < 50ms.
   * Возвращает только id/title/slug/price — не полный документ.
   *
   * Пример запроса: GET /api/search/products/autocomplete?q=ipho&size=5
   */
  @Get('products/autocomplete')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Autocomplete — поисковые подсказки',
    description: `
Быстрые suggestions при вводе текста в строку поиска.

**Рекомендации по интеграции:**
- Дебаунс на клиенте: 150–300 мс
- Минимальная длина запроса: 2 символа (короче — пустой ответ без запроса к OS)
- Кешировать результаты на клиенте по ключу запроса

**Алгоритм поиска:**
1. \`search_as_you_type\` с \`bool_prefix\` — мгновенное префиксное совпадение
2. Edge n-gram fallback с \`fuzziness=1\` — опечатки в последнем слове

**Пример:** запрос \`"ipho"\` вернёт \`"iPhone 15 Pro"\`, \`"iPhone 14"\` и т.д.
    `.trim(),
  })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    example: 'ipho',
    description:
      'Поисковый запрос (минимум 2 символа). ' +
      'Поддерживает частичный ввод, опечатки (1 символ), русский и английский.',
  })
  @ApiQuery({
    name: 'size',
    required: false,
    type: Number,
    example: 8,
    description:
      'Максимальное количество подсказок. Диапазон: 1–20. По умолчанию: 8.',
  })
  @ApiOkResponse({
    description: 'Список подсказок для выпадающего меню',
    type: AutocompleteResponseDto,
  })
  async autocomplete(
    @Query() dto: AutocompleteDto,
  ): Promise<AutocompleteResponseDto> {
    return this.searchService.autocomplete(dto);
  }

  // ─── POST /api/search/reindex ─────────────────────────────────────────────

  /**
   * Полный реиндекс всех товаров из PostgreSQL.
   *
   * Пример: POST /api/search/reindex
   * Headers: Authorization: Bearer <admin_token>
   */
  @Post('reindex')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Полный реиндекс товаров',
    description: `
Пересоздаёт OpenSearch-индекс и повторно индексирует все товары из PostgreSQL.

**Требует роль:** Admin

**Когда использовать:**
- После первого деплоя (начальная индексация)
- После изменения маппинга (поля, analyzers)
- После bulk-миграции данных в PostgreSQL
- При расхождении данных между PostgreSQL и OpenSearch

**Процесс:**
1. Удаляет текущий индекс \`products\`
2. Создаёт новый с актуальным маппингом и analyzers
3. Загружает все офферы из PostgreSQL батчами по 300
4. Индексирует через Bulk API
5. Возвращает отчёт

**⚠️ ДЕСТРУКТИВНАЯ операция** — в момент реиндекса поиск возвращает пустые результаты.
Для zero-downtime используйте index aliases (blue/green pattern).

**Время выполнения:** ~1–5 сек на 1000 товаров (зависит от ресурсов OpenSearch).
    `.trim(),
  })
  @ApiOkResponse({
    description: 'Отчёт о результатах реиндекса',
    type: ReindexResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Токен отсутствует или истёк. Требуется Bearer JWT.',
  })
  @ApiForbiddenResponse({
    description: 'Недостаточно прав. Требуется роль Admin.',
  })
  async reindex(): Promise<ReindexResponseDto> {
    return this.searchService.reindexAll();
  }
}
