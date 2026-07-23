import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  SellerProfileEntity,
  GalleryImage,
} from './entities/seller-profile.entity';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { OfferEntity } from '../offer/entities/offer.entity';
import { User } from '../user/entities/user.entity';
import { SellerPublicResponseDto } from './dto/seller-public-response.dto';
import { StorageService } from '../storage/storage.service';

const GALLERY_LIMIT = 10;

@Injectable()
export class SellerProfileService {
  constructor(
    @InjectRepository(SellerProfileEntity)
    private readonly profileRepository: Repository<SellerProfileEntity>,
    @InjectRepository(OfferEntity)
    private readonly offerRepository: Repository<OfferEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly storageService: StorageService,
  ) {}

  async getPublicProfile(
    sellerId: number,
    page = 1,
    limit = 12,
  ): Promise<SellerPublicResponseDto> {
    const seller = await this.userRepository.findOne({
      where: { id: sellerId },
    });
    if (!seller) throw new NotFoundException('Seller not found');

    const profile = await this.profileRepository.findOne({
      where: { userId: sellerId },
    });

    const [offers, total] = await this.offerRepository.findAndCount({
      where: {
        author: { id: sellerId },
        inStock: true,
      },
      order: { createdAt: 'desc' },
      relations: ['category'],
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      sellerId,
      companyName: profile?.companyName ?? null,
      aboutCompany: profile?.aboutCompany ?? null,
      phones: profile?.phones ?? [],
      branches: profile?.branches ?? [],
      gallery: profile?.gallery ?? [],
      offers,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getOrCreateProfile(userId: number): Promise<SellerProfileEntity> {
    let profile = await this.profileRepository.findOne({ where: { userId } });

    if (!profile) {
      profile = this.profileRepository.create({
        userId,
        companyName: null,
        aboutCompany: null,
        phones: [],
        branches: [],
        gallery: [],
      });
      profile = await this.profileRepository.save(profile);
    }

    return profile;
  }

  async updateProfile(
    userId: number,
    dto: UpdateSellerProfileDto,
  ): Promise<SellerProfileEntity> {
    const profile = await this.getOrCreateProfile(userId);

    if (dto.companyName !== undefined) profile.companyName = dto.companyName;
    if (dto.aboutCompany !== undefined) profile.aboutCompany = dto.aboutCompany;
    if (dto.phones !== undefined) profile.phones = dto.phones;
    if (dto.branches !== undefined) profile.branches = dto.branches;

    return this.profileRepository.save(profile);
  }

  async addGalleryImage(
    userId: number,
    imageUrl: string,
  ): Promise<SellerProfileEntity> {
    const profile = await this.getOrCreateProfile(userId);

    if (profile.gallery.length >= GALLERY_LIMIT) {
      throw new BadRequestException(
        `Gallery is full. Maximum ${GALLERY_LIMIT} images allowed.`,
      );
    }

    const newImage: GalleryImage = { id: randomUUID(), url: imageUrl };
    profile.gallery = [...profile.gallery, newImage];

    return this.profileRepository.save(profile);
  }

  async removeGalleryImage(
    userId: number,
    imageId: string,
  ): Promise<SellerProfileEntity> {
    const profile = await this.getOrCreateProfile(userId);

    const removed = profile.gallery.find((img) => img.id === imageId);
    if (!removed) throw new NotFoundException('Image not found in gallery');

    profile.gallery = profile.gallery.filter((img) => img.id !== imageId);

    const saved = await this.profileRepository.save(profile);

    // Best-effort cleanup of the underlying object; failures are logged
    // inside the storage service and must not block the DB update.
    await this.storageService.deleteByUrl(removed.url);

    return saved;
  }
}
