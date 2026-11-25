import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { drugsDocs } from '../../swagger/path/drugs';
import { DatabaseIdPipe } from '../../common/query-id';
import { Permissions, type AuthRequest } from '../auth/auth.guard';
import { isAdministrativeRole } from '../auth/administrative-role';
import { DrugsService } from './drugs.service';
import { parseDrugCreate, parseDrugUpdate } from './dto/drug-write.dto';

@drugsDocs.controller
@Controller('drugs')
export class DrugsController {
  constructor(private readonly drugs: DrugsService) {}

  @drugsDocs.list
  @Get()
  @Permissions('REFERENCE_EDIT')
  @Header('Cache-Control', 'no-store')
  list(@Query('q') query?: string, @Query('after') after?: string) {
    if ((query !== undefined && (typeof query !== 'string' || query.length > 100)) ||
        (after !== undefined && (typeof after !== 'string' || !/^\d+$/.test(after) || Number(after) > 2147483647))) {
      throw new BadRequestException('Invalid search parameters');
    }
    return this.drugs.list(query?.trim() || undefined, after === undefined ? undefined : Number(after));
  }

  @drugsDocs.create
  @Post()
  @Permissions('REFERENCE_EDIT')
  create(@Body() input: unknown, @Req() request: AuthRequest) {
    const actor = request.principal;
    if (!actor || !isAdministrativeRole(actor.role)) throw new ForbiddenException();
    return this.drugs.create(parseDrugCreate(input), actor.userId);
  }

  @drugsDocs.update
  @Patch(':id')
  @Permissions('REFERENCE_EDIT')
  update(@Body() input: unknown, @Param('id', DatabaseIdPipe) id: number, @Req() request: AuthRequest) {
    const actor = request.principal;
    if (!actor || !isAdministrativeRole(actor.role)) throw new ForbiddenException();
    return this.drugs.update(id, parseDrugUpdate(input), actor.userId);
  }
}
