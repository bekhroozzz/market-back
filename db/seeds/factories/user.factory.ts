import { faker } from '@faker-js/faker/locale/ru';
import { Role } from '../../../src/user/enums/role.enum';

/** Plain-text password used for all seeded accounts. Hashed by @BeforeInsert on save. */
export const SEED_PASSWORD = 'Password123!';

export interface UserSeedData {
  email: string;
  /** Plain-text — @BeforeInsert will hash via bcrypt */
  password: string;
  role: Role;
  emailVerified: boolean;
  phone: string;
}

/** Deterministic phone by role prefix + index */
function phone(prefix: string, index: number): string {
  return `+7${prefix}${String(index).padStart(7, '0')}`;
}

export function makeAdmin(index: number): UserSeedData {
  return {
    email: `admin${index === 0 ? '' : index + 1}@market.local`,
    password: SEED_PASSWORD,
    role: Role.Admin,
    emailVerified: true,
    phone: phone('700', index),
  };
}

const SELLER_SLUGS = ['techno', 'events', 'photo', 'catering', 'music', 'decor'];

export function makeSeller(index: number): UserSeedData {
  const slug = SELLER_SLUGS[index % SELLER_SLUGS.length];
  return {
    email: `seller.${slug}@market.local`,
    password: SEED_PASSWORD,
    role: Role.Seller,
    emailVerified: true,
    phone: phone('701', index),
  };
}

export function makeBuyer(index: number): UserSeedData {
  faker.seed(index + 1000); // deterministic per index
  return {
    email: `buyer${index + 1}@market.local`,
    password: SEED_PASSWORD,
    role: Role.User,
    emailVerified: index % 5 !== 4, // every 5th buyer is unverified
    phone: phone('702', index),
  };
}
