import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe } from '@nestjs/common';
import { TiendaService } from './tienda.service';
import { CreateTiendaDto } from './dto/create-tienda.dto';
import { UpdateTiendaDto } from './dto/update-tienda.dto';

@Controller('tienda')
export class TiendaController {

    constructor(private readonly tiendaService: TiendaService) {}

    @Post()
    create(@Body() createTiendaDto: CreateTiendaDto) {
    return this.tiendaService.create(createTiendaDto);
    }

    @Get()
    findAll() {
        return this.tiendaService.findAll();
    } 

    @Get(':id')
    findById(@Param('id', ParseUUIDPipe) id: string) {
        return this.tiendaService.findById(id);
    }

    @Patch(':id')
    update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateTiendaDto: UpdateTiendaDto
    ) {
        return this.tiendaService.update(id, updateTiendaDto);
    }

    @Delete(':id')
    delete(@Param('id', ParseUUIDPipe) id: string) {
        return this.tiendaService.delete(id);
    }










}
