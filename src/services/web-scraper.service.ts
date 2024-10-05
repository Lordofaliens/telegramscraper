import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import {Browser, Page} from 'puppeteer';
import {ChannelService} from "../mongo/channel.service";
import {Cron, CronExpression} from "@nestjs/schedule";
import {detectLanguage, isOlderThanWeek, promptForChannelUsername, signature} from "../util/misc";

@Injectable()
export class WebScraperService implements OnModuleInit {
    private logger = new Logger(WebScraperService.name);
    private page: Page;
    private browser: Browser;

    constructor(private readonly channelService: ChannelService) {}

    async onModuleInit(): Promise<any> {
        await signature();

        this.browser = await puppeteer.launch({ headless: false });
        this.page = await this.browser.newPage();

        await this.login();
        await this.subscribeAllFoundChannels();
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
        await this.openChatInfo();
        await this.openSimilarChannels(true);

        if(await this.channelService.getByUsername(channelName)) {
            await Promise.race([this.channelService.updatePropertyByUsername(channelName, "status", "visited"), this.channelService.updatePropertyByUsername(channelName, "lastVisit", Date.now())])
        } else {
            const description = await this.getChannelDescription();
            await this.channelService.createChannel({username: channelName, description, language: detectLanguage(description)});
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

    async openSimilarChannels(isProcessChannels) {
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
                    if(isProcessChannels) await this.processSimilarChannels();
                    break;
                }
            }

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
        let clickableDivs = await this.page.$$('div.ListItem.chat-item-clickable.search-result');
        this.logger.log("clickableDivs LENGTH:"+ clickableDivs.length);
        while(i < clickableDivs.length) {
            try {
                await Promise.all([
                    this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
                    clickableDivs[i].click(),
                ]);
                await new Promise(resolve => setTimeout(resolve, 500));
                this.logger.log('New page URL: ' + this.page.url());

                await new Promise(resolve => setTimeout(resolve, 500));

                const username = await this.extractChannelUsername();
                const description = await this.getChannelDescription();

                this.logger.log('Extracted Channel Username: ' + username);
                this.logger.log('Extracted Channel Description: ' + description);

                const channelInfo = {username, description, language: detectLanguage(description)};
                if(channelInfo && !(await this.channelService.getByUsername(channelInfo.username))) {
                    this.logger.log('Channel added to the DB: ' + username);
                    await this.channelService.createChannel(channelInfo);
                }

                await Promise.all([
                    this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
                    this.page.goBack({ waitUntil: 'networkidle2' })
                ]);
                await new Promise(resolve => setTimeout(resolve, 500));
                this.logger.log('Returned to URL: ' + this.page.url());

                await this.openSimilarChannels(false);

                i++;
                await this.page.waitForSelector('div.ListItem.chat-item-clickable.search-result');
                clickableDivs = await this.page.$$('div.ListItem.chat-item-clickable.search-result');
            } catch (error) {
                this.logger.error(`Error processing item ${i}:`, error);
            }
        }
    }

    async getChannelDescription(): Promise<string> {
        await this.page.waitForSelector('div.Profile div.profile-info div.ChatExtra div.ListItem-button div.multiline-item span.title', { timeout: 10000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        return await this.page.evaluate(() => {
            const divs = document.querySelectorAll('div.multiline-item');

            for (let div of divs) {
                const subtitle = div.querySelector('span.subtitle');
                const titleSpan = div.querySelector('span.title');

                if (subtitle && subtitle.textContent.trim() == 'Info' && titleSpan) {
                    return titleSpan.textContent?.trim() || '';
                }
            }

            return null;
        });
    }

    async extractChannelUsername(): Promise<string | null> {
        await this.page.waitForSelector('div.Profile div.profile-info div.ChatExtra div.ListItem-button div.multiline-item span.title', { timeout: 10000 });

        return await this.page.evaluate(() => {
            const divs = document.querySelectorAll('div.multiline-item');

            for (let div of divs) {
                const subtitle = div.querySelector('span.subtitle');
                const title = div.querySelector('span.title');

                if (subtitle && subtitle.textContent.trim() == 'Link' && title) {
                    const linkText = title.textContent.trim();
                    if (linkText) {
                        return linkText.replace('https://t.me/', '');
                    }
                }
            }
            return null;
        });
    }

    // DEPRECATED
    //@Cron(CronExpression.EVERY_2_HOURS)
    async resetVisitedChannels() {
        const visitedChannels = (await this.channelService.getAllVisited()).filter(x => isOlderThanWeek(x.lastVisit));
        if(visitedChannels && visitedChannels.length > 0) {
            const channelPromises = visitedChannels.map(channel => this.channelService.updatePropertyByUsername(channel.username, "status", "outdated"));
            await Promise.race(channelPromises);
        }
    }

    @Cron(CronExpression.EVERY_2_HOURS)
    async subscribeAllFoundChannels() {
        const unSubbedChannels = (await this.channelService.getAllUnSubbed()).map(x => x.username).filter(x => x);
        for(const channel of unSubbedChannels) {
            await this.searchClickChannel(channel);
            await this.subscribeChannel(channel);
            await this.channelService.updatePropertyByUsername(channel, "subscribed", true)
            await Promise.all([
                this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
                this.page.goBack({ waitUntil: 'networkidle2' })
            ]);
        }
    }

    @Cron(CronExpression.EVERY_2_HOURS)
    async processUnvisitedChannels() {
        const unvisitedChannels = (await this.channelService.getAllUnvisited()).map(x => x.username).filter(x => x);
        if(!unvisitedChannels || unvisitedChannels.length === 0) {
            const channelTags = await promptForChannelUsername();
            for(const tag of channelTags) unvisitedChannels.push(tag);
        }
        await this.startScraping(unvisitedChannels);
    }
}
