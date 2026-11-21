import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TiendaClientMock } from '../clients';
import {
  CreatePedidoDto,
  ItemPedidoResponseDto,
  PedidoResponseDto,
  QueryPedidoDto,
  UpdatePedidoDto,
} from '../dtos';
import { EventoPedidoRepository, PedidoRepository, ProductoRepository } from '../repositories';
import { EventoPedido, ItemPedido, Pedido } from '../repositories/entities';

@Injectable()
export class PedidoService {
  constructor(
    private readonly pedidoRepository: PedidoRepository,
    private readonly productoRepository: ProductoRepository,
    private readonly eventoPedidoRepository: EventoPedidoRepository,
    private readonly tiendaClient: TiendaClientMock,
    @Inject('DATA_SOURCE') private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePedidoDto): Promise<PedidoResponseDto> {
    const tiendaExists = await this.tiendaClient.exists(dto.tiendaId);
    if (!tiendaExists) {
      throw new BadRequestException(`Tienda con id ${dto.tiendaId} no existe`);
    }

    for (const item of dto.items) {
      const producto = await this.productoRepository.findById(item.productoId);
      if (!producto) {
        throw new BadRequestException(
          `Producto con id ${item.productoId} no existe`,
        );
      }
    }

    const pedido = await this.dataSource.transaction(async (manager) => {
      const newPedido = manager.create(Pedido, {
        identificador: dto.identificador,
        tiendaId: dto.tiendaId,
        fechaHoraCreacion: dto.fechaHoraCreacion,
        montoTotal: dto.montoTotal,
        monedaId: dto.monedaId,
        estado: dto.estado,
        items: dto.items as ItemPedido[],
      });
      const saved = await manager.save(newPedido);

      // Event store (Event Sourcing)
      await manager.save(EventoPedido, {
        pedidoId: saved.id,
        tipo: 'PedidoCreado',
        payload: {
          tiendaId: saved.tiendaId,
          montoTotal: saved.montoTotal,
          estado: saved.estado,
          identificador: saved.identificador,
        },
        version: 1,
        occurredAt: new Date(),
      });

      return saved;
    });

    return this.mapToResponse(pedido);
  }

  async findAll(query: QueryPedidoDto): Promise<PedidoResponseDto[]> {
    const pedidos = await this.pedidoRepository.findAll(query);
    return pedidos.map((pedido) => this.mapToResponse(pedido));
  }

  async findById(id: string): Promise<PedidoResponseDto> {
    const pedido = await this.pedidoRepository.findById(id);
    if (!pedido) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }
    return this.mapToResponse(pedido);
  }

  async update(id: string, dto: UpdatePedidoDto): Promise<PedidoResponseDto> {
    const pedido = await this.pedidoRepository.findById(id);
    if (!pedido) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }

    const estadoAnterior = pedido.estado;
    const estadoCambia = dto.estado !== undefined && dto.estado !== estadoAnterior;

    if (estadoCambia) {
      const updatedPedido = await this.dataSource.transaction(async (manager) => {
        await manager.update(Pedido, id, dto as Partial<Pedido>);
        const updated = await manager.findOne(Pedido, {
          where: { id },
          relations: ['items'],
        });

        // Tarea 1.2: el evento se registra dentro de la misma transacción que el UPDATE.
        const version = await this.eventoPedidoRepository.nextVersion(id, manager);
        await manager.save(EventoPedido, {
          pedidoId: id,
          tipo: 'PedidoCambioEstado',
          payload: {
            estadoAnterior,
            estadoNuevo: dto.estado,
            montoTotal: updated!.montoTotal,
          },
          version,
          occurredAt: new Date(),
        });

        return updated!;
      });
      return this.mapToResponse(updatedPedido);
    }

    const updatedPedido = await this.pedidoRepository.update(id, dto);
    return this.mapToResponse(updatedPedido!);
  }

  async delete(id: string): Promise<void> {
    const pedido = await this.pedidoRepository.findById(id);
    if (!pedido) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }
    await this.pedidoRepository.delete(id);
  }

  // TODO (estudiante — Tarea 1.3): implementar getHistorial
  // Debe retornar todos los eventos del pedido ordenados por version ASC.
  async getHistorial(id: string): Promise<EventoPedido[]> {
    const pedido = await this.pedidoRepository.findById(id);
    if (!pedido) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }
    return this.eventoPedidoRepository.findByPedidoId(id);
  }

  private mapToResponse(pedido: Pedido): PedidoResponseDto {
    return {
      id: pedido.id,
      identificador: pedido.identificador,
      tiendaId: pedido.tiendaId,
      fechaHoraCreacion: pedido.fechaHoraCreacion,
      montoTotal: pedido.montoTotal,
      monedaId: pedido.monedaId,
      estado: pedido.estado,
      items: pedido.items?.map((item) => this.mapItemToResponse(item)),
      createdAt: pedido.createdAt,
      updatedAt: pedido.updatedAt,
    };
  }

  private mapItemToResponse(item: ItemPedido): ItemPedidoResponseDto {
    return {
      id: item.id,
      pedidoId: item.pedidoId,
      productoId: item.productoId,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      descuento: item.descuento,
      monedaId: item.monedaId,
      lote: item.lote,
      fechaVencimiento: item.fechaVencimiento,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
