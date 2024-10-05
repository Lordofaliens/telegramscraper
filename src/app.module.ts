import {ChannelController} from "./mongo/channel.controller";
import {ChannelModule} from "./mongo/channel.module";
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import {WebScraperService} from "./services/web-scraper.service";
import * as dotenv from "dotenv";

dotenv.config();

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGODB_URI),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
      ChannelModule
  ],
  controllers: [AppController, ChannelController],
  providers: [AppService, WebScraperService],
})
export class AppModule {}
