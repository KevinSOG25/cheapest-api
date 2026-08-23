import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class UpdateTiendaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nombre?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rut?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  dirrecion?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  telefono?: string;
}