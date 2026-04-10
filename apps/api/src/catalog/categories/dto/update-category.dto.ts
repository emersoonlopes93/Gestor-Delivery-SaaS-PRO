import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';
import { UpdateCategoryDto as IUpdateCategoryDto } from '@gestor/types';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) implements IUpdateCategoryDto {}
