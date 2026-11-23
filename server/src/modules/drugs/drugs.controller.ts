import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { drugsDocs } from '../../swagger/path/drugs';
import { Permissions } from '../auth/auth.guard';
import { DrugsService } from './drugs.service';

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
}
