import { PartialType } from '@nestjs/mapped-types';
import { CreateComboBlockDto, CreateComboBlockItemDto, CreateComboDto } from './create-combo.dto';
import { UpdateProductComboDto as IUpdateProductComboDto } from '@gestor/types';

export class UpdateComboDto extends PartialType(CreateComboDto) implements IUpdateProductComboDto {}

export class UpdateComboBlockDto extends PartialType(CreateComboBlockDto) {}

export class UpdateComboBlockItemDto extends PartialType(CreateComboBlockItemDto) {}
