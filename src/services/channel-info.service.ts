import {Injectable, Logger} from '@nestjs/common';
import {TelegramClient} from 'telegram';
import {StringSession} from 'telegram/sessions';
import {Api} from 'telegram/tl';
import * as readline from "node:readline";
import {cryptoKeywords, tap2EarnKeywords, tradingKeywords} from "../util/key-words";
import {detectLanguage} from "../util/misc";

@Injectable()
export class ChannelInfoService {
    private logger = new Logger(ChannelInfoService.name);
    private client: TelegramClient;
    private isAuthenticated = false;
    private readonly session: StringSession;

    constructor() {
        const apiId = parseInt(process.env.TELEGRAM_API_ID);
        const apiHash = process.env.TELEGRAM_API_HASH;

        this.session = new StringSession('');
        this.client = new TelegramClient(this.session, apiId, apiHash, {
            connectionRetries: 2,
        });
    }

    private async authenticate() {
        if (!this.isAuthenticated) {
            try {
                await this.client.start({
                    phoneNumber: async () => process.env.TELEGRAM_PHONE,
                    password: async () => process.env.TELEGRAM_PASSWORD,
                    phoneCode: async () => { return await this.promptUserForCode() },
                    onError: (err) => this.logger.error(err),
                });

                this.isAuthenticated = true;
                this.logger.log('Authenticated successfully.');
            } catch (error) {
                this.logger.error('Failed to authenticate:', error);
                throw error;
            }
        }
    }


    async getChannelInfoByUsername(username: string) {
        await this.authenticate();
        try {
            const result = await this.client.invoke(
                new Api.channels.GetFullChannel({
                    channel: username,
                })
            );

            const chat = result.chats[0];

            if (chat instanceof Api.Chat || chat instanceof Api.Channel) {
                const channelTitle = chat.title;
                const channelDescription = result.fullChat.about || '';
                const hasAdminInDescription = channelDescription.includes("@");

                const isCryptoRelated = cryptoKeywords.some((keyword) =>
                    channelTitle.toLowerCase().includes(keyword) ||
                    channelDescription.toLowerCase().includes(keyword)
                );
                const isTradingRelated = tradingKeywords.some((keyword) =>
                    channelTitle.toLowerCase().includes(keyword) ||
                    channelDescription.toLowerCase().includes(keyword)
                );
                const isTap2EarnRelated = tap2EarnKeywords.some((keyword) =>
                    channelTitle.toLowerCase().includes(keyword) ||
                    channelDescription.toLowerCase().includes(keyword)
                );

                if(!(hasAdminInDescription && (isCryptoRelated || isTradingRelated || isTap2EarnRelated))) return null;
                return {username: username, description: channelDescription, language: detectLanguage(channelDescription) };
            } else {
                this.logger.error(`The chat is of an unexpected type and does not have a title.`);
                return null;
            }

        } catch (err) {
            this.logger.error(`Failed to get the info of the channel ${username}:`, err);
            return null;
        }
    }

    async promptUserForCode(): Promise<string> {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const userInputPromise = new Promise<string>((resolve) => {
            rl.question('Enter the code sent by Telegram: ', (code: string) => {
                rl.close();
                resolve(code);
            });
        });
        const timeoutPromise = new Promise<string>((_, reject) => {
            setTimeout(() => {
                rl.close();
                reject(new Error('Timeout: No code entered within 60 seconds.'));
            }, 60000);
        });

        return Promise.race([userInputPromise, timeoutPromise]);
    }

    async disconnectClient() {
        if (this.isAuthenticated) {
            await this.client.disconnect();
            this.isAuthenticated = false;
            this.logger.log('Disconnected from Telegram.');
        }
    }
}