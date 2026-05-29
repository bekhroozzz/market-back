import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { categoriesData } from './categories.data';
import { CategoryEntity } from '../../src/category/entities/category.entity';
import { OfferEntity } from '../../src/offer/entities/offer.entity';
import { ReviewEntity } from '../../src/review/entities/review.entity';
import { User } from '../../src/user/entities/user.entity';
import { SellerProfileEntity } from '../../src/seller-profile/entities/seller-profile.entity';
import { seedUsers } from './user.seed';
import { seedSellerProfiles } from './seller-profile.seed';
import { dataSourceOptions } from '../data-source';

/**
 * Seed the full category tree (materialized-path).
 * Returns all leaf categories (parentId is not null).
 */
export async function seedCategoriesTree(
  dataSource: DataSource,
): Promise<CategoryEntity[]> {
  const treeRepo = dataSource.getTreeRepository(CategoryEntity);

  const existing = await treeRepo.count();
  if (existing > 0) {
    console.log(`⏭️  Categories already seeded (${existing} found), skipping...`);
    return treeRepo.find({ where: { parentId: undefined } });
  }

  const parentCategories = await Promise.all(
    categoriesData.map((parentData) =>
      treeRepo.save({
        name: parentData.name,
        description: parentData.description ?? null,
      }),
    ),
  );

  const allChildren: CategoryEntity[] = [];

  for (let i = 0; i < categoriesData.length; i++) {
    const parentData = categoriesData[i];
    const parent = parentCategories[i];

    if (parentData.children?.length) {
      const children = await treeRepo.save(
        parentData.children.map((childData) => ({
          name: childData.name,
          description: (childData as { description?: string }).description ?? null,
          parent,
        })),
      );
      allChildren.push(...children);
    }
  }

  console.log(
    `✅ Categories seeded: ${parentCategories.length} parents, ${allChildren.length} leaf categories`,
  );

  return allChildren;
}

/** Entry point for: pnpm seed:categories */
async function seed() {
  dotenv.config();
  process.env.NODE_ENV = 'seeding';

  const dataSource = new DataSource({
    ...dataSourceOptions,
    entities: [CategoryEntity, OfferEntity, ReviewEntity, User, SellerProfileEntity],
  });

  await dataSource.initialize();

  try {
    await dataSource.query(`
      TRUNCATE TABLE
        offers,
        reviews,
        seller_profiles,
        categories,
        users
      RESTART IDENTITY CASCADE
    `);

    const { sellers } = await seedUsers(dataSource);
    await seedSellerProfiles(dataSource, sellers);
    await seedCategoriesTree(dataSource);

    console.log('\n🎉 seed:categories completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  seed().catch((error) => {
    console.error('❌ Fatal seeding error:', error);
    process.exit(1);
  });
}
