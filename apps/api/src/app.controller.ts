import { Controller, Get, Head } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      name: 'Gestor Delivery API',
      status: 'ok',
      version: process.env.npm_package_version ?? '0.1.0',
      environment: process.env.NODE_ENV ?? 'development',
    };
  }

  @Head()
  headRoot() {
    return;
  }
}
