import { IsOptional, IsString } from 'class-validator';

// All optional — Company Profile is filled in gradually via the settings
// screen, not required up front (see Billing_Module_Build_Prompt.md §8:
// the actual registered address is still unconfirmed, so nothing here
// should be required or defaulted to a guessed value).
export class UpdateCompanyProfileDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  companyAddress?: string;

  @IsOptional()
  @IsString()
  companyPhone?: string;

  @IsOptional()
  @IsString()
  companyEmail?: string;

  @IsOptional()
  @IsString()
  companyGstin?: string;

  @IsOptional()
  @IsString()
  companyState?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  bankIfsc?: string;

  @IsOptional()
  @IsString()
  bankAccountHolderName?: string;

  @IsOptional()
  @IsString()
  defaultTermsAndConditions?: string;
}
