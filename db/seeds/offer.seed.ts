import * as dotenv from 'dotenv';
import { DataSource, IsNull, Not } from 'typeorm';
import { CategoryEntity } from '../../src/category/entities/category.entity';
import { OfferEntity } from '../../src/offer/entities/offer.entity';
import { ReviewEntity } from '../../src/review/entities/review.entity';
import { User } from '../../src/user/entities/user.entity';
import { Role } from '../../src/user/enums/role.enum';
import { dataSourceOptions } from '../data-source';
import { offersData } from './offers.data';

async function seedOffers() {
  dotenv.config();
  process.env.NODE_ENV = 'seeding';

  const dataSource = new DataSource({
    ...dataSourceOptions,
    entities: [CategoryEntity, OfferEntity, ReviewEntity, User],
  });

  await dataSource.initialize();

  const offerRepository = dataSource.getRepository(OfferEntity);
  const categoryRepository = dataSource.getRepository(CategoryEntity);
  const userRepository = dataSource.getRepository(User);

  try {
    const sellerAuthors = await userRepository.find({
      where: { role: Role.Seller },
    });
    const fallbackAuthors = sellerAuthors.length ? sellerAuthors : await userRepository.find();

    if (!fallbackAuthors.length) {
      throw new Error(
        'Users not found. Run "pnpm run seed:categories" before seeding offers.',
      );
    }

    const categories = await categoryRepository.find({
      where: { parentId: Not(IsNull()) },
    });

    if (!categories.length) {
      throw new Error(
        'Categories not found. Run "pnpm run seed:categories" before seeding offers.',
      );
    }

    const categoryByName = new Map(categories.map((category) => [category.name, category]));
    const missingCategories = [
      ...new Set(
        offersData
          .map((offer) => offer.categoryName)
          .filter((categoryName) => !categoryByName.has(categoryName)),
      ),
    ];

    if (missingCategories.length) {
      throw new Error(
        `Missing categories for offers: ${missingCategories.join(', ')}`,
      );
    }

    await dataSource.query(`
      TRUNCATE TABLE
        reviews,
        offers
      RESTART IDENTITY CASCADE
    `);

    const offersToSave = offersData.map((offerData, index) => {
      const category = categoryByName.get(offerData.categoryName);
      const author = fallbackAuthors[index % fallbackAuthors.length];

      return offerRepository.create({
        title: offerData.title,
        description: offerData.description,
        images: offerData.images,
        price: offerData.price,
        oldPrice: offerData.oldPrice,
        inStock: offerData.inStock,
        attributes: offerData.attributes,
        branchAddress: offerData.branchAddress,
        rating: Number((3.5 + (index % 14) * 0.1).toFixed(2)),
        salesCount: 5 + ((index * 9) % 280),
        category_id: category.id,
        category,
        author,
      });
    });

    for (let index = 0; index < offersToSave.length; index += 25) {
      const chunk = offersToSave.slice(index, index + 25);
      await offerRepository.save(chunk);
    }

    console.log(`✅ Offers seeded successfully! Added ${offersToSave.length} offers.`);
  } catch (error) {
    console.error('❌ Offer seeding failed:', error);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

seedOffers().catch((error) => {
  console.error('❌ Fatal offer seeding error:', error);
  process.exit(1);
});
