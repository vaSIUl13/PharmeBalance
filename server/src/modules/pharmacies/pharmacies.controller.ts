import { BadRequestException, Body, Controller, DefaultValuePipe, Get, Header, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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

@ApiTags('pharmacies')
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private readonly pharmacies: PharmaciesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List managed pharmacies visible to the current user' })
  @ApiQuery({ name: 'after', required: false, type: Number })
  list(@Req() req: AuthRequest, @Query('after', new DefaultValuePipe(0), ParseIntPipe) after: number) {
    if (after < 0 || after > 2147483647) throw new BadRequestException('Invalid cursor');
    return this.pharmacies.list(req.principal!, after);
  }

  @Get('external')
  @Permissions('REFERENCE_EDIT')
  external(@Query('q') query?: string, @Query('after') after?: string) {
    if ((query !== undefined && (typeof query !== 'string' || query.length > 100)) ||
        (after !== undefined && (typeof after !== 'string' || !/^\d+$/.test(after) ||
          Number(after) > 2147483647))) throw new BadRequestException('Invalid search parameters');
    return this.pharmacies.external(query?.trim(), after === undefined ? undefined : Number(after));
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'View a managed pharmacy within the current user scope' })
  detail(@Req() req: AuthRequest, @Param('id', ParseIntPipe) id: number) {
    return this.pharmacies.detail(req.principal!, id);
  }

  @Post()
  @Permissions('REFERENCE_EDIT')
  @ApiBody({ schema: { type: 'object', required: ['code', 'name', 'city', 'address', 'latitude', 'longitude'],
    properties: {
      code: { type: 'string', maxLength: 20 }, name: { type: 'string', maxLength: 100 },
      city: { type: 'string', maxLength: 60 }, address: { type: 'string', maxLength: 150 },
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
      externalRecordIds: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 10 },
    },
  } })
  create(@Body() input: unknown, @Req() request: AuthRequest) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Expected pharmacy data');
    const body = input as Record<string, unknown>;
    const code = text(body, 'code', 20).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code) || code.startsWith('SYN-')) throw new BadRequestException('Invalid pharmacy code');
    const ids = body.externalRecordIds ?? [];
    if (!Array.isArray(ids) || ids.length > 10 ||
        ids.some((id) => !Number.isInteger(id) || id <= 0 || id > 2147483647)) {
      throw new BadRequestException('Invalid external record IDs');
    }
    return this.pharmacies.create({
      code, name: text(body, 'name', 100), city: text(body, 'city', 60), address: text(body, 'address', 150),
      latitude: coordinate(body.latitude, 'latitude', 90), longitude: coordinate(body.longitude, 'longitude', 180),
    }, [...new Set<number>(ids)], request.principal!.userId);
  }
}
