import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { OfferEntity } from './entities/offer.entity';
import { CreateOfferDto } from './dto/create-offer.dto';
import { CategoryEntity } from '../category/entities/category.entity';
import { OfferIndexerService } from '../search/indexing/offer-indexer.service';

/**
 * Generates a URL-friendly slug from a title string.
 * Handles Cyrillic via transliteration map + standard slug normalization.
 */
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
  ) {}

  async findAll(): Promise<OfferEntity[]> {
    return this.offerRepository.find({
      order: { createdAt: 'desc' },
      relations: ['category', 'author'],
    });
  }

  async findById(id: string): Promise<OfferEntity> {
    const offer = await this.offerRepository.findOne({
      where: { id },
      relations: ['category', 'author'],
    });

    if (!offer) throw new NotFoundException('Offer not found');

    const categoryRepo = this.dataSource.getTreeRepository(CategoryEntity);
    offer.category = await categoryRepo.findAncestorsTree(offer.category);

    return offer;
  }

  async create(offerDto: CreateOfferDto): Promise<OfferEntity> {
    if (!offerDto) throw new Error('Not provided data for new offer');

    const newOffer = this.offerRepository.create({
      title: offerDto.title,
      slug: offerDto.slug ?? generateSlug(offerDto.title),
      description: offerDto.description,
      images: offerDto.images,
      price: offerDto.price,
      oldPrice: offerDto.oldPrice,
      inStock: offerDto.inStock ?? true,
      brandId: offerDto.brandId,
      attributes: offerDto.attributes ?? [],
      category_id: offerDto.categoryId,
      author: { id: Number(offerDto.authorId) },
      branchAddress: offerDto.branchAddress,
    });

    const saved = await this.offerRepository.save(newOffer);

    // Reload with full relations so the response contains the complete author + category objects
    const savedOffer = await this.findById(saved.id);

    // Fire-and-forget: OpenSearch sync is eventual consistency.
    // The API response is not delayed by index latency.
    // Failures are logged but do not fail the main operation.
    this.offerIndexer.upsertOffer(savedOffer.id).catch((err: Error) => {
      this.logger.warn(
        `[OpenSearch] Failed to index offer ${savedOffer.id}: ${err.message}`,
      );
    });

    return savedOffer;
  }

  async update(id: string, offerDto: CreateOfferDto): Promise<OfferEntity> {
    const existing = await this.findById(id);
    Object.assign(existing, {
      ...offerDto,
      // Regenerate slug if title changed and no explicit slug provided
      slug:
        offerDto.slug ??
        (offerDto.title ? generateSlug(offerDto.title) : existing.slug),
      category_id: offerDto.categoryId ?? existing.category_id,
    });

    const saved = await this.offerRepository.save(existing);

    // Reload to return fresh state with all relations populated
    const savedOffer = await this.findById(saved.id);

    this.offerIndexer.upsertOffer(savedOffer.id).catch((err: Error) => {
      this.logger.warn(
        `[OpenSearch] Failed to update offer ${savedOffer.id} in index: ${err.message}`,
      );
    });

    return savedOffer;
  }

  async delete(id: string): Promise<OfferEntity> {
    const offer = await this.findById(id);
    const removed = await this.offerRepository.remove(offer);

    // Remove from OpenSearch after successful DB deletion.
    // The ID is still available on the removed entity.
    this.offerIndexer.removeOffer(id).catch((err: Error) => {
      this.logger.warn(
        `[OpenSearch] Failed to remove offer ${id} from index: ${err.message}`,
      );
    });

    return removed;
  }
}
