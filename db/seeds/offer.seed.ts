import * as dotenv from 'dotenv';
import { DataSource, IsNull, Not } from 'typeorm';
import { CategoryEntity } from '../../src/category/entities/category.entity';
import { OfferEntity } from '../../src/offer/entities/offer.entity';
import { ReviewEntity } from '../../src/review/entities/review.entity';
import { User } from '../../src/user/entities/user.entity';
import { SellerProfileEntity } from '../../src/seller-profile/entities/seller-profile.entity';
import { Role } from '../../src/user/enums/role.enum';
import { dataSourceOptions } from '../data-source';
import { offersData } from './offers.data';

/**
 * Seed offers.
 * Requires sellers and leaf categories to already exist in the database.
 * Distributes offers round-robin across sellers.
 */
export async function seedOffers(dataSource: DataSource): Promise<OfferEntity[]> {
  const offerRepository = dataSource.getRepository(OfferEntity);
  const categoryRepository = dataSource.getRepository(CategoryEntity);
  const userRepository = dataSource.getRepository(User);

  const sellers = await userRepository.find({ where: { role: Role.Seller } });
  const fallbackSellers = sellers.length ? sellers : await userRepository.find();

  if (!fallbackSellers.length) {
    throw new Error('No users found. Run "pnpm seed:categories" before seeding offers.');
  }

  const leafCategories = await categoryRepository.find({
    where: { parentId: Not(IsNull()) },
  });

  if (!leafCategories.length) {
    throw new Error('No leaf categories found. Run "pnpm seed:categories" before seeding offers.');
  }

  const categoryByName = new Map(leafCategories.map((cat) => [cat.name, cat]));

  const missingCategories = [
    ...new Set(
      offersData
        .map((offer) => offer.categoryName)
        .filter((name) => !categoryByName.has(name)),
    ),
  ];

  if (missingCategories.length) {
    throw new Error(`Missing categories: ${missingCategories.join(', ')}`);
  }

  const offersToSave = offersData.map((offerData, index) => {
    const category = categoryByName.get(offerData.categoryName)!;
    // Round-robin distribution across sellers for even spread
    const author = fallbackSellers[index % fallbackSellers.length];

    return offerRepository.create({
      title: offerData.title,
      description: offerData.description,
      images: offerData.images,
      price: offerData.price,
      oldPrice: offerData.oldPrice,
      inStock: offerData.inStock,
      attributes: offerData.attributes,
      branchAddress: offerData.branchAddress,
      rating: Number((3.5 + (index % 15) * 0.1).toFixed(2)),
      salesCount: 5 + ((index * 9) % 280),
      category_id: category.id,
      category,
      author,
    });
  });

  const saved: OfferEntity[] = [];
  const CHUNK_SIZE = 25;

  for (let i = 0; i < offersToSave.length; i += CHUNK_SIZE) {
    const chunk = offersToSave.slice(i, i + CHUNK_SIZE);
    const savedChunk = await offerRepository.save(chunk);
    saved.push(...savedChunk);
  }

  console.log(`✅ Offers seeded: ${saved.length} total`);
  console.log(
    `   Distributed across ${fallbackSellers.length} sellers (${Math.ceil(saved.length / fallbackSellers.length)} per seller on avg)`,
  );

  return saved;
}

/** Entry point for: pnpm seed:offers */
async function seedOffersStandalone() {
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
        reviews,
        offers
      RESTART IDENTITY CASCADE
    `);

    await seedOffers(dataSource);

    console.log('\n🎉 seed:offers completed successfully!');
  } catch (error) {
    console.error('❌ Offer seeding failed:', error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  seedOffersStandalone().catch((error) => {
    console.error('❌ Fatal offer seeding error:', error);
    process.exit(1);
  });
}
