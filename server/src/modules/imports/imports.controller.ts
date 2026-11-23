import { applyDecorators, BadRequestException, Body, Controller, Get, Header, HttpCode, HttpException,
  Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { importsDocs } from '../../swagger/path/imports';
import type { DataType } from '@prisma/client';
import { optionalQueryId } from '../../common/query-id';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { maxBytes, snapshotTime } from './import-file';
import { ImportsService } from './imports.service';

type File = { originalname: string; buffer: Buffer };

function importFile() {
  return applyDecorators(
    HttpCode(200),
    UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxBytes, files: 1, fields: 2, parts: 4, fieldSize: 100 } })),
  );
}

@importsDocs.controller
@Permissions('DATA_IMPORT')
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @importsDocs.history
  @Get()
  @Header('Cache-Control', 'no-store')
  history(@Req() req: AuthRequest, @Query('before') before?: string) {
    return this.imports.history(req.principal!, optionalQueryId(before, 'before'));
  }

  @importsDocs.detail
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.imports.detail(req.principal!, optionalQueryId(id, 'id')!);
  }

  @importsDocs.stocks
  @Post('stocks')
  @importFile()
  stocks(@Req() req: AuthRequest, @UploadedFile() file: File | undefined, @Body() fields: Record<string, unknown>) {
    return this.submit(req, file, fields, 'STOCKS');
  }

  @importsDocs.sales
  @Post('sales')
  @importFile()
  sales(@Req() req: AuthRequest, @UploadedFile() file: File | undefined, @Body() fields: Record<string, unknown>) {
    return this.submit(req, file, fields, 'SALES');
  }

  private async submit(req: AuthRequest, file: File | undefined, fields: Record<string, unknown>, dataType: DataType) {
    if (!file || !/\.(csv|json)$/i.test(file.originalname) || file.originalname.length > 150 ||
        /[\u0000-\u001f]/.test(file.originalname)) throw new BadRequestException('Expected a .csv or .json file');
    const pharmacyId = optionalQueryId(fields.pharmacyId, 'pharmacyId');
    const allowed = dataType === 'STOCKS' ? ['pharmacyId', 'snapshotAt'] : ['pharmacyId'];
    if (!pharmacyId || Object.keys(fields).some(key => !allowed.includes(key))) throw new BadRequestException('Invalid form fields');
    const snapshotAt = dataType === 'STOCKS' ? snapshotTime(fields.snapshotAt) : undefined;
    if (dataType === 'STOCKS' && !snapshotAt) throw new BadRequestException('Expected a past or present UTC snapshotAt');
    const batch = await this.imports.upload(req.principal!, { pharmacyId, dataType, snapshotAt, fileName: file.originalname,
      buffer: file.buffer, sourceFormat: /\.csv$/i.test(file.originalname) ? 'CSV' : 'JSON' });
    if (batch.status === 'REJECTED') throw new HttpException(batch, 422);
    return batch;
  }
}
