import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/datasources/database.module';
import { DataSource } from 'typeorm';
import { TiendaController } from './tienda/tienda.controller';
import { TiendaService } from './tienda/tienda.service';
import { Tienda } from './tienda/entities/tienda.entity';

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
  providers: [...tiendaProviders, TiendaService],
  exports: [TiendaService],
})
export class IdentificacionModule {}

