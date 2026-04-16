import { PartialType } from '@nestjs/mapped-types';
import { CreateOptionItemDto } from './create-option-item.dto';

export class UpdateOptionItemDto extends PartialType(CreateOptionItemDto) {}
