/**
 * Unified seed orchestrator.
 *
 * Pipeline:
 *   1. Truncate all related tables (CASCADE)
 *   2. Seed users   → 2 admins, 4 sellers, 4 buyers
 *   3. Seed seller profiles → one profile per seller
 *   4. Seed categories → tree structure (10 parents, ~60 leaves)
 *   5. Seed offers  → 100 offers distributed across sellers + categories
 *
 * Usage: pnpm seed:all
 */

import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { CategoryEntity } from '../../src/category/entities/category.entity';
import { OfferEntity } from '../../src/offer/entities/offer.entity';
import { ReviewEntity } from '../../src/review/entities/review.entity';
import { User } from '../../src/user/entities/user.entity';
import { SellerProfileEntity } from '../../src/seller-profile/entities/seller-profile.entity';
import { dataSourceOptions } from '../data-source';
import { seedUsers } from './user.seed';
import { seedSellerProfiles } from './seller-profile.seed';
import { seedCategoriesTree } from './category.seed';
import { seedOffers } from './offer.seed';

async function seedAll() {
  dotenv.config();
  process.env.NODE_ENV = 'seeding';

  const dataSource = new DataSource({
    ...dataSourceOptions,
    entities: [CategoryEntity, OfferEntity, ReviewEntity, User, SellerProfileEntity],
  });

  await dataSource.initialize();
  console.log('🔗 Database connected\n');

  try {
    // Full reset — order matters due to FKs
    await dataSource.query(`
      TRUNCATE TABLE
        reviews,
        offers,
        seller_profiles,
        categories,
        users
      RESTART IDENTITY CASCADE
    `);
    console.log('🗑️  Tables truncated\n');

    // 1. Users
    const { sellers } = await seedUsers(dataSource);

    // 2. Seller profiles (requires sellers)
    await seedSellerProfiles(dataSource, sellers);

    // 3. Category tree
    await seedCategoriesTree(dataSource);

    // 4. Offers (requires sellers + categories)
    await seedOffers(dataSource);

    console.log('\n🎉 Full seed completed successfully!');
    console.log('   Run "pnpm search:reindex" to sync OpenSearch index.');
  } catch (error) {
    console.error('\n❌ Seed pipeline failed:', error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

seedAll().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
