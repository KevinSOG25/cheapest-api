import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/datasources/database.module';
import { DataSource } from 'typeorm';
import { TiendaController } from './controllers/tienda.controller';
import { TiendaService } from './services/tienda.service';
import { TiendaRepository } from './reposiotries/tienda.repository';
import { Tienda } from './entities/tienda.entity';

const tiendaProviders = [
  {
    provide: 'TIENDA_REPOSITORY',
    useFactory: (dataSource: DataSource) => dataSource.getRepository(Tienda),
    inject: ['DATA_SOURCE'],
  },
];

@Module({
  imports: [DatabaseModule],
  controllers: [TiendaController],
  providers: [...tiendaProviders, TiendaRepository, TiendaService],
  exports: [TiendaService],
})
export class IdentificacionModule { }


