import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { GetCurrentUserId } from '../auth/decorators/get-current-user-id.decorator';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Уведомления пользователя (пагинация)' })
  getNotifications(
    @GetCurrentUserId() userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.notificationService.getForUser(userId, page);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Количество непрочитанных уведомлений' })
  getUnreadCount(@GetCurrentUserId() userId: number) {
    return this.notificationService.getUnreadCount(userId);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Отметить все уведомления прочитанными' })
  markAllRead(@GetCurrentUserId() userId: number) {
    return this.notificationService.markAllRead(userId);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Отметить уведомление прочитанным' })
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @GetCurrentUserId() userId: number,
  ) {
    return this.notificationService.markRead(id, userId);
  }
}
