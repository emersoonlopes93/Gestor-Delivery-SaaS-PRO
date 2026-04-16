import { PartialType } from '@nestjs/mapped-types';
import { CreateComboSlotAllowedItemDto } from './create-combo-slot-allowed-item.dto';

export class UpdateComboSlotAllowedItemDto extends PartialType(CreateComboSlotAllowedItemDto) {}
