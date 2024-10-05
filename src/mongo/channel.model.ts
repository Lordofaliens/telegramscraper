import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChannelDocument = Channel & Document;

@Schema()
export class Channel extends Document {
  @Prop({ unique: true })
  username: string;

  @Prop()
  description: string;

  @Prop()
  language: string;

  @Prop({default: "added"})
  status: string;

  @Prop({default: new Date(-8640000000000000)})
  lastVisit: Date;

  @Prop({default: false})
  subscribed: boolean;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
