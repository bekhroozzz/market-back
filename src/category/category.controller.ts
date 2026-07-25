import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryEntity } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Категории')
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Public()
  @Get('get-all')
  @ApiOperation({ summary: 'Получить все категории (с деревом)' })
  @ApiResponse({
    status: 200,
    description: 'Успешно получены все категории',
    type: CategoryEntity,
    isArray: true,
  })
  async getAll(): Promise<CategoryEntity[]> {
    return await this.categoryService.getCategories();
  }

  @Get('get-by-id/:id')
  @ApiOperation({ summary: 'Получить категорию по ID' })
  @ApiParam({
    name: 'id',
    description: 'ID категории',
    example: '8e7f20c1-3fbd-4c19-a3d9-d88c8c5a5e1e',
  })
  @ApiResponse({
    status: 200,
    description: 'Категория найдена',
    type: CategoryEntity,
  })
  @ApiResponse({ status: 404, description: 'Категория не найдена' })
  async getById(@Param('id') id: string): Promise<CategoryEntity> {
    return await this.categoryService.getCategoryById(id);
  }

  @Post('create')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin, Role.Seller)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Создать новую категорию',
    description:
      'Slug уникален среди siblings. Полный path для URL возвращается в поле `path`.',
  })
  @ApiBody({
    type: CreateCategoryDto,
    description: 'Поля для создания категории',
  })
  @ApiResponse({
    status: 201,
    description: 'Категория успешно создана',
    type: CategoryEntity,
  })
  @ApiResponse({
    status: 400,
    description: 'Невалидный / зарезервированный slug',
  })
  @ApiResponse({ status: 409, description: 'Slug уже занят у этого родителя' })
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryEntity> {
    return await this.categoryService.createCategory(createCategoryDto);
  }

  @Delete('delete/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Удалить ветку категории',
    description:
      'Удаляет категорию и всех потомков. Офферы из ветки переносятся на родителя ' +
      '(или category_id=null, если удаляется корень), затем реиндексируются в OpenSearch.',
  })
  @ApiParam({
    name: 'id',
    description: 'ID категории для удаления',
    example: 'b382ed4f-ff1b-470e-a324-9e6469e0eb33',
  })
  @ApiResponse({
    status: 204,
    description: 'Категория и её потомки удалены, офферы переназначены',
  })
  @ApiResponse({ status: 404, description: 'Категория не найдена' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.categoryService.deleteCategoryBranchAndReassignAllOffers(id);
  }
}
