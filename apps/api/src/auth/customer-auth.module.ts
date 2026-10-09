import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerAuthController } from './customer-auth.controller';
import { AuthModule } from './auth.module';
import { DatabaseModule } from '../database/database.module';
import { CrmModule } from '../crm/crm.module';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { CustomerGoogleVerifierService } from './customer-google-verifier.service';
import { CustomerSessionService } from './customer-session.service';
import { CustomerAuthGuard } from './guards/customer-auth.guard';

@Module({
  imports: [
    DatabaseModule,
    AuthModule, // Imports JwtModule indirectly
    CrmModule,  // Provides CustomerService
    WhatsAppChannelModule,
    JwtModule.register({}),
  ],
  controllers: [CustomerAuthController],
  providers: [
    CustomerAuthService,
    CustomerSessionService,
    CustomerGoogleVerifierService,
    CustomerAuthGuard,
    WhatsAppCloudService,
  ],
  exports: [CustomerAuthService],
})
export class CustomerAuthModule {}
