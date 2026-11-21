import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { optionalQueryId } from '../../common/query-id';
import { Permissions } from '../auth/auth.guard';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Permissions('AUDIT_VIEW')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read business audit events, newest entries first' })
  @ApiQuery({ name: 'before', required: false, type: Number, description: 'Pass next from the previous page' })
  @ApiQuery({ name: 'targetUserId', required: false, type: Number })
  list(@Query('before') before?: string, @Query('targetUserId') target?: string) {
    return this.audit.list(optionalQueryId(before, 'before'), optionalQueryId(target, 'targetUserId'));
  }
}
