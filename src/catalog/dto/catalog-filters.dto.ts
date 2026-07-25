import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  SearchProductsDto,
  SortOption,
} from '../../search/dto/search-products.dto';

/**
 * Query filters for a catalog page.
 * Category identity comes from the URL path, not from these params.
 */
export class CatalogFiltersDto extends OmitType(SearchProductsDto, [
  'q',
  'category',
  'sort',
] as const) {
  @ApiPropertyOptional({
    enum: SortOption,
    default: SortOption.POPULARITY,
    description: `Сортировка:
- \`popularity\` — по продажам (по умолчанию)
- \`price_asc\` / \`price_desc\`
- \`newest\``,
  })
  @IsOptional()
  @IsEnum(SortOption)
  sort?: SortOption = SortOption.POPULARITY;
}
