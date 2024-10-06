import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {google} from 'googleapis';
import {Cron, CronExpression} from "@nestjs/schedule";
import {ChannelService} from "../mongo/channel.service";

@Injectable()
export class GoogleSheetsService implements OnModuleInit {
    private sheets: any;
    private readonly spreadsheetId = process.env.SPREADSHEET_ID;
    private readonly sheetName = process.env.SPREADSHEET_LIST;
    private logger = new Logger();

    constructor(private readonly channelService: ChannelService) {}

    async onModuleInit(): Promise<any> {
        const auth = new google.auth.GoogleAuth({
            keyFile: './google-sheets-credentials.json',
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.sheets = google.sheets({ version: 'v4', auth });

        await this.handleUpdate();
    }

    async updateSheetData(data: any[]) {
        return await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${this.sheetName}!B2`,
            valueInputOption: 'RAW',
            requestBody: {
                values: data,
            },
        });
    }

    async syncDataToGoogleSheet() {
        const channels = await this.channelService.getAll();
        const data = channels.map(channel => [
            channel._id.toString(),
            channel.username,
            channel.description,
            channel.language,
            channel.status,
            channel.subscribed ? 'Yes' : 'No',
        ]);

        await this.updateSheetData(data);
    }

    @Cron(CronExpression.EVERY_HOUR)
    async handleUpdate() {
        await this.syncDataToGoogleSheet();
        this.logger.log('Google Sheets updated with MongoDB data.');
    }
}
