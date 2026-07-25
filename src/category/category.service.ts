import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TreeRepository, DataSource, In, IsNull } from 'typeorm';
import { instanceToPlain } from 'class-transformer';
import { CategoryEntity } from './entities/category.entity';
import { OfferEntity } from '../offer/entities/offer.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { AppCacheService } from '../cache/app-cache.service';
import { OfferIndexerService } from '../search/indexing/offer-indexer.service';
import {
  generateSlug,
  isReservedCategorySlug,
  isUuid,
} from '../common/utils/slug.util';

const CATEGORY_NS = 'categories';
const OFFER_NS = 'offers';
// Categories change rarely — cache the whole tree for 10 minutes.
const CATEGORY_TREE_TTL_MS = 10 * 60 * 1000;

export type CategoryLookup = {
  id: string;
  slug: string;
  name: string;
  /** Full path from root, e.g. woman/odezhda/tolstovky-i-svitshoty */
  path: string;
};

export type CategoryPathResolution = {
  category: CategoryEntity;
  breadcrumbs: Array<{
    id: string;
    slug: string;
    name: string;
    path: string;
  }>;
  path: string;
};

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: TreeRepository<CategoryEntity>,
    private readonly dataSource: DataSource,
    private readonly cache: AppCacheService,
    @Inject(forwardRef(() => OfferIndexerService))
    private readonly offerIndexer: OfferIndexerService,
  ) {}

  async createCategory(dto: CreateCategoryDto): Promise<CategoryEntity> {
    let parent: CategoryEntity | null = null;
    if (dto.parentId) {
      parent = await this.categoryRepository.findOne({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Родительская категория с ID ${dto.parentId} не найдена.`,
        );
      }
    }

    const parentId = parent?.id ?? null;
    const isRoot = parentId === null;
    const explicitSlug = Boolean(dto.slug?.trim());
    const baseSlug = explicitSlug
      ? generateSlug(dto.slug!.trim())
      : generateSlug(dto.name);

    if (!baseSlug) {
      throw new BadRequestException(
        'Не удалось сформировать slug категории из названия.',
      );
    }

    if (isReservedCategorySlug(baseSlug, isRoot)) {
      throw new BadRequestException(
        `Slug "${baseSlug}" зарезервирован для API (/catalog/${baseSlug}). ` +
          'Выберите другой slug для корневой категории.',
      );
    }

    const slug = explicitSlug
      ? await this.assertSlugAvailable(baseSlug, parentId)
      : await this.ensureUniqueSlug(baseSlug, parentId);

    const newCategory = this.categoryRepository.create({
      name: dto.name,
      description: dto.description,
      slug,
    });

    if (parent) {
      newCategory.parent = parent;
    }

    const saved = await this.categoryRepository.save(newCategory);
    await this.cache.bump(CATEGORY_NS);

    return this.withPath(saved);
  }

  async getCategories(): Promise<CategoryEntity[]> {
    const version = await this.cache.version(CATEGORY_NS);
    return this.cache.wrap(
      `${CATEGORY_NS}:v${version}:tree-with-path`,
      CATEGORY_TREE_TTL_MS,
      async () => {
        const trees = await this.dataSource
          .getTreeRepository(CategoryEntity)
          .findTrees();
        const plain = instanceToPlain(trees) as Array<
          CategoryEntity & { path?: string; children?: CategoryEntity[] }
        >;
        return this.attachPaths(plain) as unknown as CategoryEntity[];
      },
    );
  }

  /** Adds full catalog path on every tree node for storefront URLs. */
  private attachPaths<
    T extends { slug: string; children?: T[]; path?: string },
  >(nodes: T[], prefix = ''): T[] {
    return nodes.map((node) => {
      const path = prefix ? `${prefix}/${node.slug}` : node.slug;
      return {
        ...node,
        path,
        children: node.children?.length
          ? this.attachPaths(node.children, path)
          : node.children,
      };
    });
  }

  async getCategoryById(id: string): Promise<CategoryEntity> {
    const foundedCategory = await this.categoryRepository.findOne({
      where: { id },
      relations: ['offers'],
    });

    if (!foundedCategory) throw new NotFoundException('Category not found');
    return this.withPath(foundedCategory);
  }

  /**
   * Resolves nested catalog path segments against the category tree.
   * Example: ["woman", "odezhda", "tolstovky-i-svitshoty"]
   */
  async resolveCategoryPath(
    segments: string[],
  ): Promise<CategoryPathResolution> {
    const normalized = segments
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);

    if (normalized.length === 0) {
      throw new NotFoundException('Путь категории пуст');
    }

    const chain: CategoryEntity[] = [];
    let parentId: string | null = null;

    for (const slug of normalized) {
      const found = await this.categoryRepository.findOne({
        where: parentId
          ? { slug, parentId }
          : { slug, parentId: IsNull() },
      });

      if (!found) {
        throw new NotFoundException(
          `Категория не найдена по пути "/${normalized.join('/')}" ` +
            `(сегмент "${slug}")`,
        );
      }

      chain.push(found);
      parentId = found.id;
    }

    const breadcrumbs = chain.map((cat, index) => ({
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      path: chain
        .slice(0, index + 1)
        .map((c) => c.slug)
        .join('/'),
    }));

    return {
      category: chain[chain.length - 1],
      breadcrumbs,
      path: normalized.join('/'),
    };
  }

  /**
   * Resolves a public category key to UUID for OpenSearch filters.
   * Accepts: UUID | nested path "a/b/c"
   */
  async resolveCategoryId(categoryKey: string): Promise<string> {
    const key = categoryKey.trim().replace(/^\/+|\/+$/g, '');
    if (!key) {
      throw new NotFoundException('Категория не указана');
    }

    if (isUuid(key)) {
      const byId = await this.categoryRepository.findOne({
        where: { id: key },
        select: ['id'],
      });
      if (!byId) {
        throw new NotFoundException(`Категория с ID ${key} не найдена.`);
      }
      return byId.id;
    }

    const segments = key.split('/').filter(Boolean);
    const resolved = await this.resolveCategoryPath(segments);
    return resolved.category.id;
  }

  /** Lightweight lookup map (with full path) for enriching search facets. */
  async findLookupsByIds(ids: string[]): Promise<Map<string, CategoryLookup>> {
    if (ids.length === 0) return new Map();

    const all = await this.categoryRepository.find({
      select: ['id', 'slug', 'name', 'parentId'],
    });
    const byId = new Map(all.map((row) => [row.id, row]));

    const pathOf = (id: string): string => {
      const parts: string[] = [];
      let current = byId.get(id);
      const guard = new Set<string>();
      while (current && !guard.has(current.id)) {
        guard.add(current.id);
        parts.unshift(current.slug);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return parts.join('/');
    };

    const result = new Map<string, CategoryLookup>();
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) continue;
      result.set(id, {
        id: row.id,
        slug: row.slug,
        name: row.name,
        path: pathOf(id),
      });
    }
    return result;
  }

  /**
   * Deletes a category branch (node + descendants).
   * Offers from the branch are reassigned to the parent (or null if root),
   * then reindexed in OpenSearch so catalog filters stay correct.
   */
  async deleteCategoryBranchAndReassignAllOffers(categoryId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let affectedOfferIds: string[] = [];

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
        const affectedOffers = await queryRunner.manager.find(OfferEntity, {
          where: { category_id: In(categoryIdsInBranch) },
          select: ['id'],
        });
        affectedOfferIds = affectedOffers.map((o) => o.id);

        if (affectedOfferIds.length > 0) {
          await queryRunner.manager.update(
            OfferEntity,
            { id: In(affectedOfferIds) },
            { category_id: newParentIdForOffers },
          );
        }
      }

      // TreeChildren cascade only applies to loaded relations — remove the whole
      // branch explicitly, deepest nodes first (self-FK on parentId).
      const byId = new Map(
        categoriesInBranchToDelete.map((cat) => [cat.id, cat]),
      );
      const depthOf = (id: string): number => {
        let depth = 0;
        let current = byId.get(id);
        const guard = new Set<string>();
        while (
          current?.parentId &&
          byId.has(current.parentId) &&
          !guard.has(current.id)
        ) {
          guard.add(current.id);
          depth += 1;
          current = byId.get(current.parentId);
        }
        return depth;
      };

      const sortedForDelete = [...categoriesInBranchToDelete].sort(
        (a, b) => depthOf(b.id) - depthOf(a.id),
      );
      await queryRunner.manager.remove(CategoryEntity, sortedForDelete);

      await queryRunner.commitTransaction();
      await this.cache.bump(CATEGORY_NS);
      await this.cache.bump(OFFER_NS);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        'Failed to delete category branch and reassign offers',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      await queryRunner.release();
    }

    // After successful commit: refresh OpenSearch categoryIds for moved offers
    if (affectedOfferIds.length > 0) {
      this.offerIndexer.upsertOffers(affectedOfferIds).catch((err: Error) => {
        this.logger.error(
          `Background reindex after category delete failed: ${err.message}`,
        );
      });
    }
  }

  /** Builds full path for a single category (create/get-by-id responses). */
  private async withPath(category: CategoryEntity): Promise<CategoryEntity> {
    const ancestors = await this.dataSource
      .getTreeRepository(CategoryEntity)
      .findAncestors(category);

    const byId = new Map(ancestors.map((a) => [a.id, a]));
    const parts: string[] = [];
    let current: CategoryEntity | undefined = category;
    const guard = new Set<string>();

    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      parts.unshift(current.slug);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }

    category.path = parts.join('/');
    return category;
  }

  private async assertSlugAvailable(
    slug: string,
    parentId: string | null,
  ): Promise<string> {
    const exists = await this.categoryRepository.exists({
      where: parentId
        ? { slug, parentId }
        : { slug, parentId: IsNull() },
    });

    if (exists) {
      throw new ConflictException(
        parentId
          ? `Slug "${slug}" уже занят среди дочерних категорий этого родителя.`
          : `Slug "${slug}" уже занят среди корневых категорий.`,
      );
    }

    return slug;
  }

  private async ensureUniqueSlug(
    baseSlug: string,
    parentId: string | null,
  ): Promise<string> {
    const normalized = generateSlug(baseSlug) || 'category';
    let candidate = normalized;
    let suffix = 2;

    while (
      await this.categoryRepository.exists({
        where: parentId
          ? { slug: candidate, parentId }
          : { slug: candidate, parentId: IsNull() },
      })
    ) {
      candidate = `${normalized}-${suffix++}`;
    }

    if (isReservedCategorySlug(candidate, parentId === null)) {
      candidate = `${normalized}-${suffix}`;
      while (
        await this.categoryRepository.exists({
          where: { slug: candidate, parentId: IsNull() },
        })
      ) {
        candidate = `${normalized}-${++suffix}`;
      }
    }

    return candidate;
  }
}
