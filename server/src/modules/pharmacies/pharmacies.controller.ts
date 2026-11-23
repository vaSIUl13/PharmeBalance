import { BadRequestException, Body, Controller, DefaultValuePipe, Get, Header, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { DatabaseIdPipe } from '../../common/query-id';
import { pharmaciesDocs } from '../../swagger/path/pharmacies';
import { Permissions, type AuthRequest } from '../auth/auth.guard';
import { PharmaciesService } from './pharmacies.service';

function text(body: Record<string, unknown>, key: string, max: number) {
  const input = body[key];
  if (typeof input !== 'string' || !input.trim() || input.trim().length > max) {
    throw new BadRequestException('Invalid ' + key);
  }
  return input.trim();
}

function coordinate(input: unknown, key: string, max: number) {
  if (typeof input !== 'number' || !Number.isFinite(input) || Math.abs(input) > max) {
    throw new BadRequestException('Invalid ' + key);
  }
  return input.toFixed(6);
}

@pharmaciesDocs.controller
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private readonly pharmacies: PharmaciesService) {}

  @pharmaciesDocs.list
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest, @Query('after', new DefaultValuePipe(0), ParseIntPipe) after: number) {
    if (after < 0 || after > 2147483647) throw new BadRequestException('Invalid cursor');
    return this.pharmacies.list(req.principal!, after);
  }

  @pharmaciesDocs.external
  @Get('external')
  @Permissions('REFERENCE_EDIT')
  external(@Query('q') query?: string, @Query('after') after?: string, @Query('complete') complete?: string) {
    if ((query !== undefined && (typeof query !== 'string' || query.length > 100)) ||
        (after !== undefined && (typeof after !== 'string' || !/^\d+$/.test(after) ||
          Number(after) > 2147483647)) ||
        (complete !== undefined && complete !== 'true')) throw new BadRequestException('Invalid search parameters');
    return this.pharmacies.external(query?.trim(), after === undefined ? undefined : Number(after), complete === 'true');
  }

  @pharmaciesDocs.detail
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() req: AuthRequest, @Param('id', DatabaseIdPipe) id: number) {
    return this.pharmacies.detail(req.principal!, id);
  }

  @pharmaciesDocs.create
  @Post()
  @Permissions('REFERENCE_EDIT')
  create(@Body() input: unknown, @Req() request: AuthRequest) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Expected pharmacy data');
    const body = input as Record<string, unknown>;
    const ids = body.externalRecordIds ?? [];
    if (!Array.isArray(ids) || ids.length > 10 ||
        ids.some((id) => !Number.isInteger(id) || id <= 0 || id > 2147483647)) {
      throw new BadRequestException('Invalid external record IDs');
    }
    const code = body.code === undefined && ids.length ? 'EXT-' + ids[0] : text(body, 'code', 20).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code) || code.startsWith('SYN-')) throw new BadRequestException('Invalid pharmacy code');
    return this.pharmacies.create({
      code, name: text(body, 'name', 100), city: text(body, 'city', 60), address: text(body, 'address', 150),
      latitude: coordinate(body.latitude, 'latitude', 90), longitude: coordinate(body.longitude, 'longitude', 180),
    }, [...new Set<number>(ids)], request.principal!.userId);
  }
}
