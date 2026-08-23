import { Inject, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Tienda } from '../entities/tienda.entity';

@Injectable()
export class TiendaRepository {
  constructor(
    @Inject('TIENDA_REPOSITORY')
    private readonly repository: Repository<Tienda>,
  ) { }

  async create(data: Partial<Tienda>): Promise<Tienda> {
    const tienda = this.repository.create(data);
    return await this.repository.save(tienda);
  }

  async findAll(): Promise<Tienda[]> {
    return await this.repository.find();
  }

  async findById(codigoInterno: string): Promise<Tienda | null> {
    return await this.repository.findOneBy({ codigoInterno });
  }

  async update(codigoInterno: string, data: Partial<Tienda>): Promise<Tienda | null> {
    const tienda = await this.findById(codigoInterno);
    if (!tienda) return null;
    this.repository.merge(tienda, data);
    return await this.repository.save(tienda);
  }

  async delete(codigoInterno: string): Promise<void> {
    const tienda = await this.findById(codigoInterno);
    if (tienda) {
      await this.repository.remove(tienda);
    }
  }
}
