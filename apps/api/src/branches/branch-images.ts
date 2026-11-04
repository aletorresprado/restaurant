import { BadRequestException, Controller, Delete, Get, HttpCode, Injectable, NotFoundException, Param, ParseUUIDPipe, Post, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@repo/shared-types';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { AccessGuard } from '../auth/access.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';

const maxBytes = 2 * 1024 * 1024;
type ImageFile = { buffer: Buffer; mimetype: string };
export function validateBranchImage(file?: ImageFile) {
  if (!file?.buffer?.length || file.buffer.length > maxBytes) throw new BadRequestException('Elegí una imagen JPG, PNG o WebP de hasta 2 MB');
  const bytes = file.buffer;
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
  if (!mime || mime !== file.mimetype) throw new BadRequestException('El contenido debe corresponder a una imagen JPG, PNG o WebP; no se admite SVG');
  return mime;
}

@Injectable()
export class BranchImagesService {
  constructor(private readonly db: PrismaService) {}
  async save(id: string, file?: ImageFile) {
    const imageMime = validateBranchImage(file);
    const imageVersion = randomUUID();
    const result = await this.db.branch.updateMany({ where: { id }, data: { imageData: new Uint8Array(file!.buffer), imageMime, imageVersion } });
    if (!result.count) throw new NotFoundException('Sucursal no encontrada');
    return { imageVersion };
  }
  async remove(id: string) {
    const result = await this.db.branch.updateMany({ where: { id }, data: { imageData: null, imageMime: null, imageVersion: null } });
    if (!result.count) throw new NotFoundException('Sucursal no encontrada');
    return { imageVersion: null };
  }
  async read(id: string, activeOnly: boolean) {
    const branch = await this.db.branch.findFirst({ where: { id, ...(activeOnly ? { isActive: true } : {}) }, select: { imageData: true, imageMime: true } });
    if (!branch?.imageData || !branch.imageMime) throw new NotFoundException('Imagen no disponible');
    return new StreamableFile(Buffer.from(branch.imageData), { type: branch.imageMime, length: branch.imageData.length, disposition: 'inline' });
  }
}

@ApiTags('branches') @Controller('branches/:id/image')
export class PublicBranchImageController {
  constructor(private readonly images: BranchImagesService) {}
  @Get() @ApiOperation({ summary: 'Imagen de una sucursal activa, sin autenticación' })
  read(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Cache-Control', 'no-store');
    return this.images.read(id, true);
  }
}

@ApiTags('admin/branches') @ApiBearerAuth() @UseGuards(AccessGuard, RolesGuard) @Roles(Role.ADMIN)
@Controller('admin/branches/:id/image')
export class AdminBranchImageController {
  constructor(private readonly images: BranchImagesService) {}
  @Get() @ApiOperation({ summary: 'Vista previa autenticada, incluida una sucursal inactiva' })
  read(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Cache-Control', 'no-store');
    return this.images.read(id, false);
  }
  @Post() @HttpCode(200) @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir o reemplazar foto; JPG, PNG o WebP, máximo 2 MB' })
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxBytes, files: 1, fields: 0 } }))
  save(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: ImageFile) { return this.images.save(id, file); }
  @Delete() @HttpCode(200) @ApiOperation({ summary: 'Quitar foto y volver a la imagen general' })
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.images.remove(id); }
}
