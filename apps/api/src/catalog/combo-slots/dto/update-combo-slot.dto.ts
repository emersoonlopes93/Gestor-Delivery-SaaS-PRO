import { PartialType } from '@nestjs/mapped-types';
import { CreateComboSlotDto } from './create-combo-slot.dto';

export class UpdateComboSlotDto extends PartialType(CreateComboSlotDto) {}
