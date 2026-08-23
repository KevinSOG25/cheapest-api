import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTiendaDto } from '../dto/create-tienda.dto';
import { UpdateTiendaDto } from '../dto/update-tienda.dto';
import { Tienda } from '../entities/tienda.entity';
import { TiendaRepository } from '../reposiotries/tienda.repository';

@Injectable()
export class TiendaService {
  constructor(
    private readonly tiendaRepository: TiendaRepository,
  ) { }

  async create(dto: CreateTiendaDto): Promise<Tienda> {
    return await this.tiendaRepository.create(dto);
  }

  async findAll(): Promise<Tienda[]> {
    return await this.tiendaRepository.findAll();
  }

  async findById(codigoInterno: string): Promise<Tienda> {
    const tienda = await this.tiendaRepository.findById(codigoInterno);
    if (!tienda) {
      throw new NotFoundException(`Tienda con id ${codigoInterno} no encontrada`);
    }
    return tienda;
  }

  async update(
    codigoInterno: string,
    dto: UpdateTiendaDto,
  ): Promise<Tienda> {
    await this.findById(codigoInterno);
    const updated = await this.tiendaRepository.update(codigoInterno, dto);
    return updated!;
  }

  async delete(codigoInterno: string): Promise<void> {
    await this.findById(codigoInterno);
    await this.tiendaRepository.delete(codigoInterno);
  }
}







