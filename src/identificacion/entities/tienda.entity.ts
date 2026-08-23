import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('tiendas')

export class Tienda {

  @PrimaryGeneratedColumn('uuid')
  codigoInterno: string;

  @Column()
  nombre: string;

  @Column()
  rut: string;

  @Column()
  direccion: string;

  @Column()
  telefono: string;

  // RELACION CON USUARIO que dejo comentada ya que no se pide hacer el usario que iria en este mismo modulo
  // @OneToMany(() => Usuario, (usuario) => usuario.tienda)
  // usuarios: Usuario[];

  // PARA UTILIZAR EL ENUMERACION SE HARIA DE ESTA MANERA 
    // @Column({
    // type: 'enum',
    // enum: EstadoCaptacion})
  // estadoCaptacion: EstadoCaptacion;
}