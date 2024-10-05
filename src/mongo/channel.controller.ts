import {Controller, Get, Body, Post, Delete, Patch} from '@nestjs/common';
import { ChannelService } from './channel.service';
import { Channel } from './channel.model';

@Controller('channels')
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Get('getById')
  async getChannelById(@Body('id') id: string): Promise<Channel | null> {
    return this.channelService.getById(id);
  }

  @Get('getByUsername')
  async getChannelByUsername(@Body('username') username: string): Promise<Channel | null> {
    return this.channelService.getByUsername(username);
  }

  @Post('create')
  async createUser(@Body() channel: Partial<Channel>): Promise<Channel> {
    return this.channelService.createChannel(channel);
  }

  @Delete('delete')
  async deleteUser(@Body('id') id: string): Promise<Channel | null> {
    return this.channelService.deleteChannel(id);
  }

  @Patch('updateByUsername')
  async updatePropertyByChatId(
    @Body('username') username: string,
    @Body('property') property: string,
    @Body('value') value: any,
  ): Promise<Channel | null> {
    try {
      return this.channelService.updatePropertyByUsername(username, property, value);
    } catch (error) {
      throw new Error(error.message);
    }
  }
}
