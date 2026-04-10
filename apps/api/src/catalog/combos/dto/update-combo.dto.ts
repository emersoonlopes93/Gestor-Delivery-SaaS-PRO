import { PartialType } from '@nestjs/mapped-types';
import { CreateComboDto } from './create-combo.dto';
import { UpdateProductComboDto as IUpdateProductComboDto } from '@gestor/types';

export class UpdateComboDto extends PartialType(CreateComboDto) implements IUpdateProductComboDto {}
