import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsObject,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

// Frontend already strips spaces, leading 0, and +91/91 prefixes before
// sending — this is the server-side backstop so the DB never ends up with
// a malformed phone number regardless of what calls this endpoint.
const PHONE_10_DIGIT = /^\d{10}$/;

export class CreateOrderCustomerDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @Matches(PHONE_10_DIGIT, { message: 'Phone must be exactly 10 digits' })
  phone?: string;

  @IsOptional()
  @Matches(PHONE_10_DIGIT, { message: 'Phone 2 must be exactly 10 digits' })
  phone2?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;
}

export class CreateOrderItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice: number;

  @IsOptional()
  @IsString()
  artworkNotes?: string;

  @IsOptional()
  @IsString()
  productionNotes?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => CreateOrderCustomerDto)
  customer: CreateOrderCustomerDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  advanceAmount?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  paymentAccountId?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNotEmpty({ message: 'Lead source is required' })
  @IsString()
  leadSource: string;

  @IsOptional()
  isSample?: boolean;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;

  // Sales agent's requested loyalty-points redemption, captured here at
  // creation time; actually applied at invoicing (see AccountsService
  // .approveOrder → LoyaltyService.redeemForOrder).
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  requestedLoyaltyRedemption?: number;
}
