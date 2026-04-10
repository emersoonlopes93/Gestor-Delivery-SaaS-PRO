import { PartialType } from '@nestjs/mapped-types';
import { CreateComplementGroupDto } from './create-complement-group.dto';
import { UpdateProductComplementGroupDto as IUpdateProductComplementGroupDto } from '@gestor/types';

export class UpdateComplementGroupDto extends PartialType(CreateComplementGroupDto) implements IUpdateProductComplementGroupDto {}
