import { PartialType } from '@nestjs/mapped-types';
import { CreateComplementItemDto } from './create-complement-item.dto';

export class UpdateComplementItemDto extends PartialType(CreateComplementItemDto) {}
