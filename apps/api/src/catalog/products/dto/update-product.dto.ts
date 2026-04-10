import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto as IUpdateProductDto } from '@gestor/types';

export class UpdateProductDto extends PartialType(CreateProductDto) implements IUpdateProductDto {}
