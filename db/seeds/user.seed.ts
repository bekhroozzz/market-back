import { DataSource } from 'typeorm';
import { User } from '../../src/user/entities/user.entity';
import { Role } from '../../src/user/enums/role.enum';
import { makeAdmin, makeBuyer, makeSeller, SEED_PASSWORD } from './factories/user.factory';

const ADMIN_COUNT = 2;
const SELLER_COUNT = 4;
const BUYER_COUNT = 4;

export interface SeededUsers {
  admins: User[];
  sellers: User[];
  buyers: User[];
}

/**
 * Seed users into the database.
 * Passwords are plain text here — @BeforeInsert on User entity handles bcrypt hashing.
 * Idempotent: skips if users already exist and returns the existing ones.
 */
export async function seedUsers(dataSource: DataSource): Promise<SeededUsers> {
  const userRepository = dataSource.getRepository(User);

  const existingCount = await userRepository.count();
  if (existingCount > 0) {
    console.log(`⏭️  Users already seeded (${existingCount} found), skipping...`);
    const [admins, sellers, buyers] = await Promise.all([
      userRepository.find({ where: { role: Role.Admin } }),
      userRepository.find({ where: { role: Role.Seller } }),
      userRepository.find({ where: { role: Role.User } }),
    ]);
    return { admins, sellers, buyers };
  }

  const adminData = Array.from({ length: ADMIN_COUNT }, (_, i) => makeAdmin(i));
  const sellerData = Array.from({ length: SELLER_COUNT }, (_, i) => makeSeller(i));
  const buyerData = Array.from({ length: BUYER_COUNT }, (_, i) => makeBuyer(i));

  // create() triggers @BeforeInsert hooks, so passwords will be hashed on save()
  const users = userRepository.create([...adminData, ...sellerData, ...buyerData]);
  const saved = await userRepository.save(users);

  const admins = saved.filter((u) => u.role === Role.Admin);
  const sellers = saved.filter((u) => u.role === Role.Seller);
  const buyers = saved.filter((u) => u.role === Role.User);

  console.log(
    `✅ Users seeded: ${admins.length} admins, ${sellers.length} sellers, ${buyers.length} buyers`,
  );
  console.log(`   Shared password: ${SEED_PASSWORD}`);
  console.log(`   Admins:  ${admins.map((u) => u.email).join(', ')}`);
  console.log(`   Sellers: ${sellers.map((u) => u.email).join(', ')}`);

  return { admins, sellers, buyers };
}
