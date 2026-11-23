import { Controller, Get, Header, Query } from '@nestjs/common';
import { auditDocs } from '../../swagger/path/audit';
import { optionalQueryId } from '../../common/query-id';
import { Permissions } from '../auth/auth.guard';
import { AuditService } from './audit.service';

@auditDocs.controller
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @auditDocs.list
  @Get()
  @Permissions('AUDIT_VIEW')
  @Header('Cache-Control', 'no-store')
  list(@Query('before') before?: string, @Query('targetUserId') target?: string) {
    return this.audit.list(optionalQueryId(before, 'before'), optionalQueryId(target, 'targetUserId'));
  }
}
