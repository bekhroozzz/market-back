import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CategoryEntity } from '../category/entities/category.entity';
import {
  AttributeEntryResponseDto,
  AttributeFacetDto,
  AttributeValueFacetDto,
  BrandFacetDto,
  CategoryFacetDto,
  HighlightDto,
  PriceRangeFacetDto,
  PriceStatsFacetDto,
  ProductDocumentDto,
  ProductHitDto,
  SearchFacetsDto,
} from '../search/dto/search-response.dto';
import { SortOption } from '../search/dto/search-products.dto';
import { CatalogService } from './catalog.service';
import { CatalogFiltersDto } from './dto/catalog-filters.dto';
import {
  CatalogBreadcrumbDto,
  CatalogCategoryDto,
  CatalogResponseDto,
} from './dto/catalog-response.dto';

/** Nest/Express catch-all for nested category paths (up to 8 levels). */
const CATALOG_PATH_ROUTES = [
  ':s1',
  ':s1/:s2',
  ':s1/:s2/:s3',
  ':s1/:s2/:s3/:s4',
  ':s1/:s2/:s3/:s4/:s5',
  ':s1/:s2/:s3/:s4/:s5/:s6',
  ':s1/:s2/:s3/:s4/:s5/:s6/:s7',
  ':s1/:s2/:s3/:s4/:s5/:s6/:s7/:s8',
] as const;

@ApiTags('Catalog')
@Controller('catalog')
@ApiExtraModels(
  CatalogResponseDto,
  CatalogCategoryDto,
  CatalogBreadcrumbDto,
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
)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Public()
  @Get('categories')
  @ApiOperation({
    summary: 'Дерево категорий каталога',
    description:
      'Публичное дерево категорий. URL страницы собирается из цепочки slug: ' +
      '`/catalog/{parent}/{child}/{leaf}/`.',
  })
  @ApiOkResponse({
    description: 'Дерево категорий',
    type: CategoryEntity,
    isArray: true,
  })
  getCategories(): Promise<CategoryEntity[]> {
    return this.catalogService.getCategories();
  }

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Корень каталога',
    description: 'Все товары без фильтра по категории. Фильтры — только в query.',
  })
  @ApiOkResponse({ type: CatalogResponseDto })
  browseRoot(@Query() filters: CatalogFiltersDto): Promise<CatalogResponseDto> {
    return this.catalogService.browseByPath('', filters);
  }

  /**
   * Category page by nested slug path (must stay after /categories and /).
   * Browser: /catalog/woman/odezhda/tolstovky-i-svitshoty/
   * API:     GET /api/catalog/woman/odezhda/tolstovky-i-svitshoty
   */
  @Public()
  @Get([...CATALOG_PATH_ROUTES])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Страница каталога по path',
    description: `
Листинг категории. Path в URL — вложенные slug:

\`GET /api/catalog/woman/odezhda/tolstovky-i-svitshoty\`

= браузерный URL \`/catalog/woman/odezhda/tolstovky-i-svitshoty/\`

Query только для фильтров/пагинации (\`page\`, \`sort\`, \`brand\`, цена),
не для категории.
    `.trim(),
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: SortOption,
    example: SortOption.POPULARITY,
  })
  @ApiQuery({
    name: 'brand',
    required: false,
    type: String,
    description: 'UUID бренда',
  })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'inStock', required: false, type: Boolean })
  @ApiQuery({
    name: 'attributes[color]',
    required: false,
    type: String,
    description: 'Фильтр по атрибуту: `attributes[key]=value`',
  })
  @ApiOkResponse({
    description:
      'Листинг каталога: товары, фасеты, текущая категория и breadcrumbs',
    type: CatalogResponseDto,
  })
  browseByPath(
    @Req() req: Request,
    @Param() params: Record<string, string | undefined>,
    @Query() filters: CatalogFiltersDto,
  ): Promise<CatalogResponseDto> {
    return this.catalogService.browseByPath(
      this.extractCategoryPath(req, params),
      filters,
    );
  }

  /**
   * Builds nested path from route params, with req.path fallback.
   * /api/catalog/woman/odezhda/tolstovky-i-svitshoty/ → woman/odezhda/tolstovky-i-svitshoty
   */
  private extractCategoryPath(
    req: Request,
    params: Record<string, string | undefined>,
  ): string {
    const fromParams = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']
      .map((key) => params[key])
      .filter((segment): segment is string => Boolean(segment?.trim()))
      .map((segment) => segment.trim().toLowerCase())
      .join('/');

    if (fromParams) return fromParams;

    const raw = (req.path || req.url.split('?')[0] || '').replace(/\/+$/, '');
    const marker = '/catalog';
    const idx = raw.indexOf(marker);
    if (idx === -1) return '';

    return raw
      .slice(idx + marker.length)
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
  }
}
