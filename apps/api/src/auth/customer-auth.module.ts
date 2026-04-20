import { Module } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthController } from './customer-auth.controller';
import { AuthModule } from './auth.module';
import { DatabaseModule } from '../database/database.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule, // Imports JwtModule indirectly
    CrmModule,  // Provides CustomerService
  ],
  controllers: [CustomerAuthController],
  providers: [CustomerAuthService],
  exports: [CustomerAuthService],
})
export class CustomerAuthModule {}
