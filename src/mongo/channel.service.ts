import {Injectable, Logger} from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Channel, ChannelDocument } from './channel.model';

@Injectable()
export class ChannelService {
  private logger = new Logger(ChannelService.name);
  constructor(@InjectModel(Channel.name) private channelDocument: Model<ChannelDocument>) {}

  async getAll(): Promise<Channel[]> {
    return this.channelDocument.find().exec();
  }

  async getAllAdded(): Promise<Channel[]> {
    return this.channelDocument.find({status: "added"}).exec();
  }

  async getAllVisited(): Promise<Channel[]> {
    return this.channelDocument.find({status: "visited"}).exec();
  }

  async getAllOutdated(): Promise<Channel[]> {
    return this.channelDocument.find({status: "outdated"}).exec();
  }

  async getAllUnvisited(): Promise<Channel[]> {
    return this.channelDocument.find({status: { $in: ["added", "outdated"] } }).exec();
  }

  async getById(id: string): Promise<Channel | null> {
    let res: Channel | PromiseLike<Channel>;
    try {
      res = await this.channelDocument.findById(id).exec();
    } catch (err) {
      this.logger.error(err);
    }
    return res;
  }

  async getByUsername(username: string): Promise<Channel | null> {
    let res: Channel | PromiseLike<Channel>;
    try {
      res = await this.channelDocument.findOne({ username }).exec();
    } catch (err) {
      this.logger.error(err);
    }
    return res;
  }

  async createChannel(channel: Partial<Channel>): Promise<Channel> {
    const createdChannel = new this.channelDocument(channel);
    return createdChannel.save();
  }

  async deleteChannel(id: string): Promise<Channel | null> {
    let res;
    try {
      res = await this.channelDocument.deleteOne({ _id: id }).exec();
      if (res.deletedCount === 0) return null;
    } catch (err) {
      this.logger.error(`Channel with ID ${id} not found`);
    }
    return res;
  }

  async updatePropertyById(
    id: string,
    property: string,
    value: any,
  ): Promise<Channel | null> {
    const channel = await this.channelDocument.findById(id).exec();

    if (!channel) {
      this.logger.error(`Channel with id ${id} not found`);
      return null;
    } else {
      channel[property] = value;
      return channel.save();
    }
  }

  async updatePropertyByUsername(
    username: string,
    property: string,
    value: any,
  ): Promise<Channel | null> {
    const channel = await this.channelDocument.findOne({ username: username }).exec();

    if (!channel) {
      this.logger.error(`Channel with username ${username} not found`);
      return null;
    } else {
      channel[property] = value;
      return channel.save();
    }
  }
}
