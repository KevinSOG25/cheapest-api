import { Inject, Injectable, NotFoundException} from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateTiendaDto } from './dto/create-tienda.dto';
import { UpdateTiendaDto } from './dto/update-tienda.dto';
import { Tienda } from './entities/tienda.entity';

@Injectable()
export class TiendaService {
  constructor(
    @Inject('TIENDA_REPOSITORY')
    private readonly tiendaRepository: Repository<Tienda>,
  ) {}


    async create(dto: CreateTiendaDto): Promise<Tienda> {
    
    const nuevaTienda = this.tiendaRepository.create(dto);
    return await this.tiendaRepository.save(nuevaTienda);
  }

  async findAll(): Promise<Tienda[]> {
    return await this.tiendaRepository.find();
  }

  async findById(codigoInterno: string): Promise<Tienda> {   
    const tienda = await this.tiendaRepository.findOneBy({ codigoInterno });
    if (!tienda) {
      throw new NotFoundException(`Tienda con id ${codigoInterno} no encontrada`);
    }
    
    return tienda;
  }

  async update(
    codigoInterno: string, 
    dto: UpdateTiendaDto,
  ): Promise<Tienda> {
    const tienda = await this.findById(codigoInterno);
    this.tiendaRepository.merge(tienda, dto);
    return await this.tiendaRepository.save(tienda);
  }


  async delete(codigoInterno: string): Promise<void> {
    const tienda = await this.findById(codigoInterno);
    await this.tiendaRepository.remove(tienda);
  }
}







