import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { OpenChatDto } from './dto/open-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { GetCurrentUserId } from '../auth/decorators/get-current-user-id.decorator';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../user/enums/role.enum';
import { JwtPayload } from '../auth/strategies/access-token.strategy';

@ApiTags('Chats')
@ApiBearerAuth('access-token')
@Controller('chats')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post('open')
  @ApiOperation({ summary: 'Создать или открыть существующий чат' })
  async openChat(
    @Body() dto: OpenChatDto,
    @GetCurrentUserId() userId: number,
  ) {
    const chat = await this.chatService.openChat(dto, userId);
    this.chatGateway.emitChatCreated(chat, userId);
    return chat;
  }

  @Get()
  @ApiOperation({ summary: 'Список чатов текущего пользователя' })
  listChats(
    @GetCurrentUserId() userId: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.chatService.listChats(userId, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить чат по ID' })
  getChat(
    @Param('id', ParseUUIDPipe) chatId: string,
    @GetCurrentUserId() userId: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.chatService.getChatById(chatId, userId, user.role);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Сообщения чата (пагинация)' })
  async getMessages(
    @Param('id', ParseUUIDPipe) chatId: string,
    @GetCurrentUserId() userId: number,
    @GetCurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  ) {
    return this.chatService.getMessages(chatId, userId, user.role, page);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Отправить сообщение' })
  async sendMessage(
    @Param('id', ParseUUIDPipe) chatId: string,
    @Body() dto: SendMessageDto,
    @GetCurrentUserId() userId: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    const chat = await this.chatService.getChatById(chatId, userId, user.role);
    const message = await this.chatService.sendMessage(chatId, dto, userId);

    const recipientId = chat.sellerId === userId ? chat.buyerId : chat.sellerId;
    this.chatGateway.emitMessageCreated(chatId, message);

    return message;
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Пометить сообщения прочитанными' })
  async markRead(
    @Param('id', ParseUUIDPipe) chatId: string,
    @GetCurrentUserId() userId: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    await this.chatService.markRead(chatId, userId);
    this.chatGateway.emitMessageRead(chatId, userId);
    return { ok: true };
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @ApiOperation({ summary: '[Admin] Все чаты с фильтрами' })
  adminListChats(
    @Query('sellerId') sellerId?: string,
    @Query('buyerId') buyerId?: string,
    @Query('offerId') offerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.chatService.adminListChats({
      sellerId: sellerId ? Number(sellerId) : undefined,
      buyerId: buyerId ? Number(buyerId) : undefined,
      offerId,
      dateFrom,
      dateTo,
    });
  }
}
