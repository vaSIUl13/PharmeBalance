import { applyDecorators } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

export const inboxDocs = {
  controller: ApiTags('notifications'),
  list: applyDecorators(
    ApiOperation({ summary: 'List the signed-in user’s system notifications and unread count',
      description: 'A recommendation batch includes recommendationIds. A manager can open the batch by passing its notification ID to GET /recommendations.' }),
    ApiQuery({ name: 'before', required: false, type: Number, description: 'Cursor returned as next by the previous page' }),
  ),
  read: applyDecorators(
    ApiOperation({ summary: 'Mark one notification as read' }),
    ApiNoContentResponse({ description: 'Notification marked as read or already read' }),
  ),
  readAll: applyDecorators(
    ApiOperation({ summary: 'Mark the user’s notifications through the given ID as read' }),
    ApiNoContentResponse({ description: 'Notifications marked as read' }),
  ),
};
