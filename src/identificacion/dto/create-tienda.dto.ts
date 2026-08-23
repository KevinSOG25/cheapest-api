import { IsString, IsNotEmpty } from 'class-validator';

export class CreateTiendaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  rut: string;

  @IsString()
  @IsNotEmpty()
  direccion: string;

  @IsString()
  @IsNotEmpty()
  telefono: string;
}