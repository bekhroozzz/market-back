import { DataSource } from 'typeorm';
import { SellerProfileEntity } from '../../src/seller-profile/entities/seller-profile.entity';
import { User } from '../../src/user/entities/user.entity';
import { makeSellerProfile } from './factories/seller-profile.factory';

/**
 * Create a SellerProfile for each seller user.
 * Idempotent: skips profiles that already exist (matched by userId).
 */
export async function seedSellerProfiles(
  dataSource: DataSource,
  sellers: User[],
): Promise<SellerProfileEntity[]> {
  const profileRepository = dataSource.getRepository(SellerProfileEntity);

  const existingUserIds = new Set(
    (await profileRepository.find({ select: ['userId'] })).map((p) => p.userId),
  );

  const toCreate = sellers.filter((seller) => !existingUserIds.has(seller.id));

  if (toCreate.length === 0) {
    console.log('⏭️  Seller profiles already seeded, skipping...');
    return profileRepository.find();
  }

  const profiles = toCreate.map((seller, index) => {
    const data = makeSellerProfile(index);
    return profileRepository.create({
      userId: seller.id,
      ...data,
    });
  });

  const saved = await profileRepository.save(profiles);
  console.log(`✅ Seller profiles seeded: ${saved.length} profiles`);
  saved.forEach((p, i) => console.log(`   [${i + 1}] ${p.companyName} → userId ${p.userId}`));

  return saved;
}
