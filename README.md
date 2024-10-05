# Telegram Web Scraper

## Description

**Telegram Web Scraper** specializes on discovering and saving as many Telegram channels as possible based on specific topics and languages given by user. Algorithm works mainly through the Telegram **"Similar Channels"** feature. **The Web page scraping mechanism** is used, so the program may behave a bit laggy, just restart in that case.

## Project setup

### 1. Install modules
```bash
$ npm install
```
### 2. Enter the right values into .env file
+ MONGODB_URI is a DB connection string. can be obtained on <a href="https://www.mongodb.com/products/platform/atlas-database">MongoDB website</a>
+ TELEGRAM_API_ID, TELEGRAM_API_HASH should be taken from <a href="https://my.telegram.org/auth?to=apps">Telegram API</a>
+ TELEGRAM_PHONE, TELEGRAM_PASSWORD is your private info. This telegram account should be active and have 2FA enabled

### 3. Enter the preferred key-words into ./src/util/key-words.ts based on your thematic. Crypto topic is used by default. Key-words are used to filter the channel thematic and language.
```bash
export const cryptoKeywords = [
    'crypto', 'cryptocurrency', 'blockchain', 'bitcoin', 'ethereum', 'altcoin', 'token', 'defi', 'smart contract',
];

export const tradingKeywords = [
    'trade', 'trading', 'signal', 'forex', 'bull', 'scalping', 'short', 'long', 'leverage', 'margin', 'fomo',
];


export const tap2EarnKeywords = [
    'earn', 'referral', 'money', 'bonus', 'tap', 'cashback', 'reward', 'affiliate', 'income', 'hamster',
];
```

## Compile and run the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Tech Stack 

### Check out the technologies used when developing the product

- <b>Nest JS, TS</b> as main programming framework
- <b>MongoDB, Mongoose</b> for data storage
- <b>Puppeteer library</b> for web page scraping
- <b>Telegram API</b> for getting detailed channel info

## License

This project is MIT licensed (check LICENSE.md file in this folder).

## Disclaimer

This app is **not violating any Telegram Terms & Conditions**. Lowering the delay between sending messages or loading an extremely large DB of channels may result in **anti-flood responses and cooldowns from the Telegram server**. So don't do that.
