import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TiendaClientMock } from '../clients';
import { CreatePedidoDto, QueryPedidoDto, UpdatePedidoDto } from '../dtos';
import {
  EventoPedidoRepository,
  PedidoRepository,
  ProductoRepository,
} from '../repositories';
import { EstadoPedido, EventoPedido, Pedido } from '../repositories/entities';
import { PedidoService } from './pedido.service';

describe('PedidoService', () => {
  let service: PedidoService;
  let repository: jest.Mocked<PedidoRepository>;
  let productoRepository: jest.Mocked<ProductoRepository>;
  let eventoPedidoRepository: jest.Mocked<EventoPedidoRepository>;
  let tiendaClient: jest.Mocked<TiendaClientMock>;
  let mockManager: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
  };
  let mockDataSource: { transaction: jest.Mock };

  const buildPedido = (overrides: Partial<Pedido> = {}) => ({
    id: 'ped-1',
    identificador: 'PED-001',
    tiendaId: 'tienda-1',
    fechaHoraCreacion: new Date(),
    montoTotal: 1000,
    monedaId: 'usd-1',
    estado: EstadoPedido.CREADO,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const mockProductoRepository = {
      findById: jest.fn(),
    };

    const mockEventoPedidoRepository = {
      nextVersion: jest.fn(),
      appendEvent: jest.fn(),
      findByPedidoId: jest.fn(),
    };

    const mockTiendaClient = {
      exists: jest.fn(),
    };

    mockManager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PedidoService,
        { provide: PedidoRepository, useValue: mockRepository },
        { provide: ProductoRepository, useValue: mockProductoRepository },
        {
          provide: EventoPedidoRepository,
          useValue: mockEventoPedidoRepository,
        },
        { provide: TiendaClientMock, useValue: mockTiendaClient },
        { provide: 'DATA_SOURCE', useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<PedidoService>(PedidoService);
    repository = module.get(PedidoRepository);
    productoRepository = module.get(ProductoRepository);
    eventoPedidoRepository = module.get(EventoPedidoRepository);
    tiendaClient = module.get(TiendaClientMock);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create pedido and PedidoCreado event in a transaction', async () => {
      const dto: CreatePedidoDto = {
        identificador: 'PED-001',
        tiendaId: 'tienda-1',
        fechaHoraCreacion: new Date(),
        montoTotal: 1000,
        monedaId: 'usd-1',
        estado: EstadoPedido.CREADO,
        items: [
          {
            productoId: 'prod-1',
            cantidad: 2,
            precioUnitario: 500,
            descuento: 0,
            monedaId: 'usd-1',
          },
        ],
      };
      const entity = buildPedido();

      tiendaClient.exists.mockResolvedValue(true);
      productoRepository.findById.mockResolvedValue({ id: 'prod-1' } as any);
      mockManager.save.mockResolvedValueOnce(entity);

      const result = await service.create(dto);

      expect(tiendaClient.exists).toHaveBeenCalledWith('tienda-1');
      expect(productoRepository.findById).toHaveBeenCalledWith('prod-1');
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalledWith(
        EventoPedido,
        expect.objectContaining({
          pedidoId: 'ped-1',
          tipo: 'PedidoCreado',
          version: 1,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'ped-1',
          identificador: 'PED-001',
          tiendaId: 'tienda-1',
        }),
      );
    });

    it('should throw BadRequestException when tienda does not exist', async () => {
      const dto: CreatePedidoDto = {
        identificador: 'PED-001',
        tiendaId: 'non-existent',
        fechaHoraCreacion: new Date(),
        montoTotal: 1000,
        monedaId: 'usd-1',
        estado: EstadoPedido.CREADO,
        items: [],
      };

      tiendaClient.exists.mockResolvedValue(false);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when producto does not exist', async () => {
      const dto: CreatePedidoDto = {
        identificador: 'PED-001',
        tiendaId: 'tienda-1',
        fechaHoraCreacion: new Date(),
        montoTotal: 1000,
        monedaId: 'usd-1',
        estado: EstadoPedido.CREADO,
        items: [
          {
            productoId: 'non-existent',
            cantidad: 2,
            precioUnitario: 500,
            descuento: 0,
            monedaId: 'usd-1',
          },
        ],
      };

      tiendaClient.exists.mockResolvedValue(true);
      productoRepository.findById.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return mapped pedidos', async () => {
      const query: QueryPedidoDto = { tiendaId: 'tienda-1' };
      repository.findAll.mockResolvedValue([buildPedido()] as any);

      const result = await service.findAll(query);

      expect(repository.findAll).toHaveBeenCalledWith(query);
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return pedido when found', async () => {
      repository.findById.mockResolvedValue(buildPedido() as any);

      const result = await service.findById('ped-1');

      expect(result.id).toBe('ped-1');
    });

    it('should throw NotFoundException when pedido not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update estado and append PedidoCambioEstado inside the transaction', async () => {
      const dto: UpdatePedidoDto = { estado: EstadoPedido.DESPACHADO };
      const entity = buildPedido();
      const updated = { ...entity, estado: EstadoPedido.DESPACHADO };

      repository.findById.mockResolvedValue(entity as any);
      mockManager.findOne.mockResolvedValue(updated);
      eventoPedidoRepository.nextVersion.mockResolvedValue(2);

      const result = await service.update('ped-1', dto);

      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
      expect(mockManager.update).toHaveBeenCalledWith(Pedido, 'ped-1', dto);
      expect(eventoPedidoRepository.nextVersion).toHaveBeenCalledWith(
        'ped-1',
        mockManager,
      );
      expect(mockManager.save).toHaveBeenCalledWith(
        EventoPedido,
        expect.objectContaining({
          pedidoId: 'ped-1',
          tipo: 'PedidoCambioEstado',
          version: 2,
          payload: expect.objectContaining({
            estadoAnterior: EstadoPedido.CREADO,
            estadoNuevo: EstadoPedido.DESPACHADO,
          }),
        }),
      );
      expect(repository.update).not.toHaveBeenCalled();
      expect(result.estado).toBe(EstadoPedido.DESPACHADO);
    });

    it('should not register an event when estado does not change', async () => {
      const dto: UpdatePedidoDto = { estado: EstadoPedido.CREADO };
      const entity = buildPedido();

      repository.findById.mockResolvedValue(entity as any);
      repository.update.mockResolvedValue(entity as any);

      await service.update('ped-1', dto);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
      expect(eventoPedidoRepository.nextVersion).not.toHaveBeenCalled();
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalledWith('ped-1', dto);
    });

    it('should throw NotFoundException when pedido not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('non-existent', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('should delete pedido', async () => {
      repository.findById.mockResolvedValue(buildPedido() as any);

      await service.delete('ped-1');

      expect(repository.delete).toHaveBeenCalledWith('ped-1');
    });

    it('should throw NotFoundException when pedido not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.delete('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getHistorial', () => {
    it('should return the events of the pedido ordered by version ASC', async () => {
      const eventos = [
        { pedidoId: 'ped-1', tipo: 'PedidoCreado', version: 1 },
        { pedidoId: 'ped-1', tipo: 'PedidoCambioEstado', version: 2 },
      ];
      repository.findById.mockResolvedValue(buildPedido() as any);
      eventoPedidoRepository.findByPedidoId.mockResolvedValue(eventos as any);

      const result = await service.getHistorial('ped-1');

      expect(eventoPedidoRepository.findByPedidoId).toHaveBeenCalledWith(
        'ped-1',
      );
      expect(result.map((e) => e.version)).toEqual([1, 2]);
    });

    it('should throw NotFoundException when pedido not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getHistorial('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
