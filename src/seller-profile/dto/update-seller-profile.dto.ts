import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BranchDto } from './branch.dto';

export class UpdateSellerProfileDto {
  @ApiPropertyOptional({ example: 'ООО «ТехноМир»' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  companyName?: string;

  @ApiPropertyOptional({ example: 'Мы занимаемся продажей техники с 2010 года.' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  aboutCompany?: string;

  @ApiPropertyOptional({ example: ['+7 (999) 123-45-67'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^\+?[0-9\s\-().]{7,20}$/, {
    each: true,
    message: 'Each phone must be a valid phone number',
  })
  phones?: string[];

  @ApiPropertyOptional({
    type: [BranchDto],
    description: 'List of company branches',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchDto)
  branches?: BranchDto[];
}
