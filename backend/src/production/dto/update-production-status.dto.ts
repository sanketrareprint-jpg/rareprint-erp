import { OrderProductionStage } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateProductionStatusDto {
  @IsEnum(OrderProductionStage)
  status: OrderProductionStage;
}
