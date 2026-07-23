import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, TreeRepository, DataSource, In } from 'typeorm';
import { instanceToPlain } from 'class-transformer';
import { CategoryEntity } from './entities/category.entity';
import { OfferEntity } from '../offer/entities/offer.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { AppCacheService } from '../cache/app-cache.service';

const CATEGORY_NS = 'categories';
// Categories change rarely — cache the whole tree for 10 minutes.
const CATEGORY_TREE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: TreeRepository<CategoryEntity>,
    @InjectRepository(OfferEntity)
    private readonly offerRepository: Repository<OfferEntity>,
    private readonly dataSource: DataSource,
    private readonly cache: AppCacheService,
  ) {}

  async createCategory(category: CreateCategoryDto): Promise<CategoryEntity> {
    const newCategory = this.categoryRepository.create(category);
    const saved = await this.categoryRepository.save(newCategory);
    await this.cache.bump(CATEGORY_NS);
    return saved;
  }

  async getCategories(): Promise<CategoryEntity[]> {
    const version = await this.cache.version(CATEGORY_NS);
    return this.cache.wrap(
      `${CATEGORY_NS}:v${version}:tree`,
      CATEGORY_TREE_TTL_MS,
      async () => {
        const trees = await this.dataSource
          .getTreeRepository(CategoryEntity)
          .findTrees();
        return instanceToPlain(trees) as unknown as CategoryEntity[];
      },
    );
  }

  async getCategoryById(id: string): Promise<CategoryEntity> {
    const foundedCategory = await this.categoryRepository.findOne({
      where: { id: id },
      relations: ['offers'],
    });

    if (!foundedCategory) throw new NotFoundException('Category not found');
    return foundedCategory;
  }

  async deleteCategoryBranchAndReassignAllOffers(categoryId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const topCategoryToDelete = await queryRunner.manager.findOne(
        CategoryEntity,
        {
          where: { id: categoryId },
          relations: ['parent'],
        },
      );

      if (!topCategoryToDelete) {
        throw new NotFoundException(`Категория с ID ${categoryId} не найдена.`);
      }

      const newParentIdForOffers: string | null =
        topCategoryToDelete.parentId ||
        (topCategoryToDelete.parent ? topCategoryToDelete.parent.id : null);

      const categoriesInBranchToDelete = await queryRunner.manager
        .getTreeRepository(CategoryEntity)
        .findDescendants(topCategoryToDelete);

      const categoryIdsInBranch: string[] = categoriesInBranchToDelete.map(
        (cat) => cat.id,
      );

      if (!categoryIdsInBranch.includes(topCategoryToDelete.id)) {
        categoryIdsInBranch.push(topCategoryToDelete.id);
      }

      if (categoryIdsInBranch.length > 0) {
        await queryRunner.manager.update(
          OfferEntity,
          { category_id: In(categoryIdsInBranch) },
          { category_id: newParentIdForOffers },
        );
      }

      await queryRunner.manager.remove(topCategoryToDelete);

      await queryRunner.commitTransaction();
      await this.cache.bump(CATEGORY_NS);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(
        'Failed to delete category branch and reassign offers:',
        error,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
