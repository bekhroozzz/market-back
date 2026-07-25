import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SearchResponseDto } from '../../search/dto/search-response.dto';

export class CatalogBreadcrumbDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-0000-0000-000000000001' })
  id: string;

  @ApiProperty({ example: 'odezhda' })
  slug: string;

  @ApiProperty({ example: 'Одежда' })
  name: string;

  @ApiProperty({
    example: 'woman/odezhda',
    description: 'Полный путь от корня до этого пункта breadcrumb',
  })
  path: string;
}

export class CatalogCategoryDto {
  @ApiProperty({ example: 'a1b2c3d4-0000-0000-0000-000000000003' })
  id: string;

  @ApiProperty({ example: 'tolstovky-i-svitshoty' })
  slug: string;

  @ApiProperty({ example: 'Толстовки и свитшоты' })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty({
    example: 'woman/odezhda/tolstovky-i-svitshoty',
    description: 'Канонический путь категории для URL /catalog/{path}/',
  })
  path: string;

  @ApiProperty({ type: [CatalogBreadcrumbDto] })
  breadcrumbs: CatalogBreadcrumbDto[];
}

export class CatalogResponseDto extends SearchResponseDto {
  @ApiPropertyOptional({
    type: CatalogCategoryDto,
    nullable: true,
    description:
      'Текущая категория по path. null — если открыт корень /catalog',
  })
  category: CatalogCategoryDto | null;
}
