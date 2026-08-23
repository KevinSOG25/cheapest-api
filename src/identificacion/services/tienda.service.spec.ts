import { Test, TestingModule } from '@nestjs/testing';
import { TiendaRepository } from '../reposiotries/tienda.repository';
import { TiendaService } from './tienda.service';

describe('TiendaService', () => {
  let service: TiendaService;

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TiendaService,
        {
          provide: TiendaRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<TiendaService>(TiendaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
