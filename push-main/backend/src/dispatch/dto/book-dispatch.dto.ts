import { IsString } from 'class-validator';

export class BookDispatchDto {
  @IsString()
  orderId: string;

  @IsString()
  rateId: string;
}
