import { applyDecorators, BadRequestException, Body, Controller, Get, Header, HttpCode, HttpException,
  Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import type { DataType } from '@prisma/client';
import { optionalQueryId } from '../../common/query-id';
import { type AuthRequest, Permissions } from '../auth/auth.guard';
import { maxBytes, snapshotTime } from './import-file';
import { ImportsService } from './imports.service';

type File = { originalname: string; buffer: Buffer };

function importFile(stocks: boolean) {
  return applyDecorators(
    HttpCode(200),
    UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxBytes, files: 1, fields: 2, parts: 4, fieldSize: 100 } })),
    ApiConsumes('multipart/form-data'),
    ApiBody({ schema: { type: 'object', required: stocks ? ['file', 'pharmacyId', 'snapshotAt'] : ['file', 'pharmacyId'],
      properties: { file: { type: 'string', format: 'binary', description: 'UTF-8 .csv or .json, up to 1 MiB and 5000 records' },
        pharmacyId: { type: 'integer', minimum: 1 },
        ...(stocks ? { snapshotAt: { type: 'string', format: 'date-time', description: 'Observed instant in UTC (Z)' } } : {}) } } }),
    ApiUnprocessableEntityResponse({ description: 'REJECTED batch with row errors. No inventory or sales changes.' }),
  );
}

@ApiTags('imports')
@Permissions('DATA_IMPORT')
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Import history of the assigned pharmacy' })
  @ApiQuery({ name: 'before', required: false, type: Number })
  history(@Req() req: AuthRequest, @Query('before') before?: string) {
    return this.imports.history(req.principal!, optionalQueryId(before, 'before'));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.imports.detail(req.principal!, optionalQueryId(id, 'id')!);
  }

  @Post('stocks')
  @importFile(true)
  @ApiOperation({ summary: 'Import absolute quantities for listed SKUs', description: 'CSV header: sku,quantity. JSON: [{"sku":"CAT-SAMPLE-0001","quantity":8}].' })
  stocks(@Req() req: AuthRequest, @UploadedFile() file: File | undefined, @Body() fields: Record<string, unknown>) {
    return this.submit(req, file, fields, 'STOCKS');
  }

  @Post('sales')
  @importFile(false)
  @ApiOperation({ summary: 'Import daily sales', description: 'CSV header: sku,date,quantity. JSON: [{"sku":"CAT-SAMPLE-0001","date":"2026-01-30","quantity":2}]. Optional returnedQuantity, unitPrice, replacesImportId. Corrections replace the whole daily aggregate and must name its current import ID.' })
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
