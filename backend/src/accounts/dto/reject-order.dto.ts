import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
