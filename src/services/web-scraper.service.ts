import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import {ChannelService} from "../mongo/channel.service";
import {Cron, CronExpression} from "@nestjs/schedule";
import {isOlderThanWeek, promptForChannelUsername, signature} from "../util/misc";
import {ChannelInfoService} from "./channel-info.service";
import {Page, Browser} from "puppeteer";

@Injectable()
export class WebScraperService implements OnModuleInit {
    private logger = new Logger(WebScraperService.name);
    private cis: ChannelInfoService = new ChannelInfoService();
    private page: Page;
    private browser: Browser;

    constructor(private readonly channelService: ChannelService) {}

    async onModuleInit(): Promise<any> {
        signature();

        this.browser = await puppeteer.launch({ headless: false });
        this.page = await this.browser.newPage();

        await this.login();
        await this.resetVisitedChannels();
        await this.processUnvisitedChannels();
    }

    private async login() {
        await this.page.goto('https://web.telegram.org/a/', { waitUntil: 'networkidle2' });
        this.logger.log('Please log into Telegram Web manually.');
        await this.page.waitForSelector('input[placeholder="Search"]', { timeout: 30000000 });
        this.logger.log(`Logged in.`);
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    private async startScraping(targetChannels) {
        for (const channelName of targetChannels) await this.scrapeChannel(channelName);
        this.logger.log('Channels scraped successfully.');
    }

    private async scrapeChannel(channelName: string) {
        await this.searchClickChannel(channelName);
        await this.subscribeChannel(channelName);
        await this.openChatInfo();
        await this.openSimilarChannels();

        if(await this.channelService.getByUsername(channelName)) {
            await Promise.race([this.channelService.updatePropertyByUsername(channelName, "status", "visited"), this.channelService.updatePropertyByUsername(channelName, "lastVisit", Date.now())])
        } else {
            await this.channelService.createChannel(await this.cis.getChannelInfoByUsername(channelName));
        }

        await this.page.goto('https://web.telegram.org/a/', { waitUntil: 'networkidle2' });
        await this.page.waitForSelector('input[placeholder="Search"]', { timeout: 10000 });
    }

    private async searchClickChannel(channelName: string) {
        try {
            await new Promise(resolve => setTimeout(resolve, 2000));
            this.logger.log('Searching...');
            await this.page.waitForSelector('input[placeholder="Search"]');
            await this.page.click('input[placeholder="Search"]');
            await this.page.type('input[placeholder="Search"]', channelName, { delay: 50 });
            await new Promise(resolve => setTimeout(resolve, 500));

            await this.clickOnChannelSpan(channelName);
            await new Promise(resolve => setTimeout(resolve, 500));
            this.logger.log(`Navigated to channel ${channelName}`);
        } catch (error) {
            this.logger.error(`Could not search the channel ${channelName}.`);
        }
    }

    private async subscribeChannel(channelName: string) {
        try {
            const joinButtonSelector = 'button.Button.tiny.primary.fluid.has-ripple';
            await this.page.waitForSelector(joinButtonSelector, { timeout: 5000 });

            const joinButton = await this.page.$(joinButtonSelector);
            const buttonText = await this.page.evaluate(el => el.textContent, joinButton);

            if (buttonText && buttonText.trim() === "Join Channel") {
                await joinButton.click();
                await new Promise(resolve => setTimeout(resolve, 500));
                this.logger.log(`Joined the channel ${channelName}`);
            } else this.logger.warn(`Join button text does not match. Skipping click.`);
        } catch (error) {
            this.logger.warn(`Could not find the join button for ${channelName}. You might already be subscribed.`);
        }
    }

    private async clickOnChannelSpan(channelName: string) {
        const timeout = 100000;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const elementHandle = await this.page.evaluateHandle((channelName) => {
                const divs = [...document.querySelectorAll('div.ListItem-button')];
                for (const div of divs) {
                    const span = div.querySelector('span');
                    if (span && span.textContent.startsWith(channelName) && span.textContent.endsWith('subscribers')) {
                        return div;
                    }
                }
                return null;
            }, channelName);

            if (elementHandle) {
                const element = elementHandle.asElement() as puppeteer.ElementHandle<Element>;
                if (element) {
                    await element.scrollIntoView();
                    await element.click();
                    this.logger.log(`Successfully clicked on the @${channelName} channel page`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await elementHandle.dispose();
                    return;
                }
            }
        }
        throw new Error(`Failed to find and click on the channel span @${channelName} within the time limit.`);
    }

    async openChatInfo() {
        try {
            await this.page.waitForSelector('div[class*=ChatInfo]', { timeout: 10000 });
            const chatInfoHandle = await this.page.$('div[class*=ChatInfo]');

            if (chatInfoHandle) {
                await chatInfoHandle.click();
                this.logger.log(`Opened channel info.`);
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                this.logger.error('Chat info section not found.');
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            this.logger.error('Error during the opening the chat info.');
        }
    }

    async openSimilarChannels() {
        try {
            await this.page.waitForSelector('div[id*=RightColumn]', { timeout: 30000 });
            await this.page.waitForSelector('div[class*=Profile]', { timeout: 30000 });
            await this.page.waitForSelector('div[class*=TabList]', { timeout: 30000 });
            await this.page.waitForSelector('span[class*=Tab_inner]', { timeout: 30000 });
            const similarChannelsSpans = (await this.page.$$('span[class*=Tab_inner]'));

            let similarChannelsTabFound = false;
            for (const span of similarChannelsSpans) {
                const textContent = await this.page.evaluate(el => el.textContent.trim(), span);

                if (textContent.includes("Similar Channels")) {
                    await span.scrollIntoView();
                    await span.click();
                    this.logger.log('Clicked on Similar Channels tab.');
                    similarChannelsTabFound = true;

                    await new Promise(resolve => setTimeout(resolve, 500));
                    await this.processSimilarChannels();
                    break;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            if (!similarChannelsTabFound) {
                this.logger.error('Failed to find or click on the Similar Channels tab.');
            }
        } catch (error) {
            this.logger.error('Error during the clicking process:', error);
        }
    }

    async processSimilarChannels() {
        let i = 0;
        await this.page.waitForSelector('div.ListItem.chat-item-clickable.search-result', { timeout: 30000 });
        let clickableDivs = (await this.page.$$('div.ListItem.chat-item-clickable.search-result')).slice(10);
        this.logger.log("clickableDivs LENGTH:"+ clickableDivs.length);
        while(i < clickableDivs.length) {
            try {
                await Promise.all([
                    this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
                    clickableDivs[i].click(),
                ]);

                await new Promise(resolve => setTimeout(resolve, 500));
                this.logger.log('New page URL: ' + this.page.url());

                await this.extractChannelUsername();

                await Promise.all([
                    this.page.goBack({ waitUntil: 'networkidle2' }),
                    this.page.waitForNavigation({ waitUntil: 'networkidle2' })
                ]);
                await new Promise(resolve => setTimeout(resolve, 500));
                this.logger.log('Returned to URL: ' + this.page.url());

                i++;
                clickableDivs = await this.page.$$('div.ListItem.chat-item-clickable.search-result');
            } catch (error) {
                this.logger.error(`Error processing item ${i}:`, error);
            }
        }
    }

    async extractChannelUsername() {
        await this.page.waitForSelector('div.multiline-item span.title');
        const linkToChannel = await this.page.evaluate(() => {
            const divs = document.querySelectorAll('div.multiline-item');

            for (let div of divs) {
                const subtitle = div.querySelector('span.subtitle');
                const title = div.querySelector('span.title');

                if (subtitle && subtitle.textContent.trim() === 'Link' && title) {
                    return title.textContent.trim();
                }
            }

            return null;
        });

        if(linkToChannel) {
            this.logger.log('Extracted Text Content: ' + linkToChannel);

            const username = linkToChannel.replace('https://t.me/', '');
            const channelInfo = await this.cis.getChannelInfoByUsername(username);
            if(channelInfo && !(await this.channelService.getByUsername(username))) {
                await this.channelService.createChannel(channelInfo);
            }
        } else this.logger.error('No matching div with channel link found.');

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    @Cron(CronExpression.EVERY_2_HOURS)
    async resetVisitedChannels() {
        const visitedChannels = (await this.channelService.getAllVisited()).filter(x => isOlderThanWeek(x.lastVisit));
        if(visitedChannels && visitedChannels.length > 0) {
            const channelPromises = visitedChannels.map(channel => this.channelService.updatePropertyByUsername(channel.username, "status", "outdated"));
            await Promise.race(channelPromises);
        }
    }

    @Cron(CronExpression.EVERY_2_HOURS)
    async processUnvisitedChannels() {
        const unvisitedChannels = (await this.channelService.getAllUnvisited()).map(x => x.username);
        if(!unvisitedChannels || unvisitedChannels.length === 0) {
            const channelTag = await promptForChannelUsername();
            unvisitedChannels.push(channelTag);
        }
        await this.startScraping(unvisitedChannels);
    }
}
