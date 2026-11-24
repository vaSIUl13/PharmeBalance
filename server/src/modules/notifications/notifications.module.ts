import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailService } from './email.service';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  controllers: [NotificationsController, InboxController],
  exports: [EmailService],
  providers: [NotificationsService, EmailService, InboxService],
})
export class NotificationsModule {}
