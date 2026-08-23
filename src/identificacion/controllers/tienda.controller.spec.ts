import { Test, TestingModule } from '@nestjs/testing';
import { TiendaService } from '../services/tienda.service';
import { TiendaController } from './tienda.controller';

describe('TiendaController', () => {
  let controller: TiendaController;

  beforeEach(async () => {
    const mockTiendaService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TiendaController],
      providers: [
        {
          provide: TiendaService,
          useValue: mockTiendaService,
        },
      ],
    }).compile();

    controller = module.get<TiendaController>(TiendaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
