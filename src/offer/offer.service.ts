import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OfferEntity } from './entities/offer.entity';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { CategoryEntity } from '../category/entities/category.entity';
import { OfferIndexerService } from '../search/indexing/offer-indexer.service';
import { SellerProfileService } from '../seller-profile/seller-profile.service';

function generateSlug(title: string): string {
  const cyrillicMap: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'yo',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'kh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };

  return title
    .toLowerCase()
    .split('')
    .map((char) => cyrillicMap[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160);
}

@Injectable()
export class OfferService {
  private readonly logger = new Logger(OfferService.name);

  constructor(
    @InjectRepository(OfferEntity)
    private readonly offerRepository: Repository<OfferEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly offerIndexer: OfferIndexerService,
    private readonly sellerProfileService: SellerProfileService,
  ) {}

  async findAll(
    page = 1,
    limit = 20,
  ): Promise<{
    items: OfferEntity[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const [items, total] = await this.offerRepository.findAndCount({
      order: { createdAt: 'desc' },
      relations: ['category', 'author'],
      take,
      skip,
    });

    return {
      items,
      total,
      page: Math.max(page, 1),
      limit: take,
      pages: Math.ceil(total / take),
    };
  }

  async findBySlug(slug: string): Promise<OfferEntity> {
    const offer = await this.offerRepository.findOne({
      where: { slug },
      relations: ['category', 'author'],
    });

    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }

  async findById(id: string): Promise<OfferEntity> {
    const offer = await this.offerRepository.findOne({
      where: { id },
      relations: ['category', 'author'],
    });

    if (!offer) throw new NotFoundException('Offer not found');

    const categoryRepo = this.dataSource.getTreeRepository(CategoryEntity);
    if (offer.category) {
      offer.category = await categoryRepo.findAncestorsTree(offer.category);
    }

    return offer;
  }

  async create(offerDto: CreateOfferDto): Promise<OfferEntity> {
    if (!offerDto) throw new Error('Not provided data for new offer');

    const authorId = Number(offerDto.authorId);

    // Auto-populate branchAddress from seller's first branch if not provided
    let branchAddress = offerDto.branchAddress;
    if (!branchAddress && !isNaN(authorId)) {
      try {
        const profile =
          await this.sellerProfileService.getOrCreateProfile(authorId);
        if (profile.branches?.length) {
          branchAddress = profile.branches[0].address;
        }
      } catch (err) {
        this.logger.warn(
          `Failed to load seller profile for branchAddress: ${(err as Error).message}`,
        );
      }
    }

    const newOffer = this.offerRepository.create({
      title: offerDto.title,
      slug: offerDto.slug ?? generateSlug(offerDto.title),
      description: offerDto.description,
      images: offerDto.images ?? [],
      price: offerDto.price,
      oldPrice: offerDto.oldPrice,
      prices: offerDto.prices ?? [],
      inStock: offerDto.inStock ?? true,
      brandId: offerDto.brandId,
      attributes: offerDto.attributes ?? [],
      workSchedule: offerDto.workSchedule ?? [],
      features: offerDto.features ?? [],
      rules: offerDto.rules ?? [],
      category_id: offerDto.categoryId,
      author: { id: authorId },
      branchAddress,
    });

    const saved = await this.offerRepository.save(newOffer);
    const savedOffer = await this.findById(saved.id);

    this.offerIndexer.upsertOffer(savedOffer.id).catch((err: Error) => {
      this.logger.warn(
        `[OpenSearch] Failed to index offer ${savedOffer.id}: ${err.message}`,
      );
    });

    return savedOffer;
  }

  async update(id: string, offerDto: UpdateOfferDto): Promise<OfferEntity> {
    const existing = await this.findById(id);

    Object.assign(existing, {
      ...(offerDto.title !== undefined && { title: offerDto.title }),
      ...(offerDto.description !== undefined && {
        description: offerDto.description,
      }),
      ...(offerDto.images !== undefined && { images: offerDto.images }),
      ...(offerDto.price !== undefined && { price: offerDto.price }),
      ...(offerDto.oldPrice !== undefined && { oldPrice: offerDto.oldPrice }),
      ...(offerDto.prices !== undefined && { prices: offerDto.prices }),
      ...(offerDto.inStock !== undefined && { inStock: offerDto.inStock }),
      ...(offerDto.brandId !== undefined && { brandId: offerDto.brandId }),
      ...(offerDto.attributes !== undefined && {
        attributes: offerDto.attributes,
      }),
      ...(offerDto.workSchedule !== undefined && {
        workSchedule: offerDto.workSchedule,
      }),
      ...(offerDto.features !== undefined && { features: offerDto.features }),
      ...(offerDto.rules !== undefined && { rules: offerDto.rules }),
      ...(offerDto.categoryId !== undefined && {
        category_id: offerDto.categoryId,
      }),
      ...(offerDto.branchAddress !== undefined && {
        branchAddress: offerDto.branchAddress,
      }),
      slug:
        offerDto.slug ??
        (offerDto.title ? generateSlug(offerDto.title) : existing.slug),
    });

    const saved = await this.offerRepository.save(existing);
    const savedOffer = await this.findById(saved.id);

    this.offerIndexer.upsertOffer(savedOffer.id).catch((err: Error) => {
      this.logger.warn(
        `[OpenSearch] Failed to update offer ${savedOffer.id}: ${err.message}`,
      );
    });

    return savedOffer;
  }

  async delete(id: string): Promise<OfferEntity> {
    const offer = await this.findById(id);
    const removed = await this.offerRepository.remove(offer);

    this.offerIndexer.removeOffer(id).catch((err: Error) => {
      this.logger.warn(
        `[OpenSearch] Failed to remove offer ${id} from index: ${err.message}`,
      );
    });

    return removed;
  }

  /** Called by ReviewService after a review is created/deleted to keep rating in sync. */
  async updateRatingStats(
    id: string,
    avgRating: number,
    count: number,
  ): Promise<void> {
    await this.offerRepository.update(id, {
      rating: avgRating,
      reviewCount: count,
    });
  }
}
