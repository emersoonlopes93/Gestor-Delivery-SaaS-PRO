import { PartialType } from '@nestjs/mapped-types';
import { CreateProductOptionGroupLinkDto } from './create-product-option-group-link.dto';

export class UpdateProductOptionGroupLinkDto extends PartialType(CreateProductOptionGroupLinkDto) {}
