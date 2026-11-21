import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { EventoPedido } from './entities/evento-pedido.entity';

@Injectable()
export class EventoPedidoRepository {
  constructor(
    @Inject('EVENTO_PEDIDO_REPOSITORY')
    private readonly repository: Repository<EventoPedido>,
  ) {}

  /**
   * Retorna la siguiente versión del event stream del pedido.
   * Si se pasa un EntityManager, la lectura se hace dentro de esa transacción.
   */
  async nextVersion(pedidoId: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(EventoPedido) : this.repository;
    const lastEvent = await repo.findOne({
      where: { pedidoId },
      order: { version: 'DESC' },
    });
    return lastEvent ? lastEvent.version + 1 : 1;
  }

  async appendEvent(
    data: Omit<EventoPedido, 'id' | 'createdAt'>,
  ): Promise<EventoPedido> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async findByPedidoId(pedidoId: string): Promise<EventoPedido[]> {
    return this.repository.find({
      where: { pedidoId },
      order: { version: 'ASC' },
    });
  }
}
