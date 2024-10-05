import * as readline from 'readline';
import * as AsciiArt from 'ascii-art';

export function detectLanguage(text: string): string {
    const cyrillicPattern = /[А-яЁёЇїІіЄєҐґ]/;
    const englishPattern = /[A-Za-z]/;

    if (cyrillicPattern.test(text)) {
        const ukrainianSpecificChars = /[ЇїІіЄєҐґ]/;
        if (ukrainianSpecificChars.test(text)) return 'Ukrainian';
        else return 'Russian';
    } else if (englishPattern.test(text)) {
        return 'English';
    }

    return 'Unknown';
}

export function isOlderThanWeek(date: Date): boolean {
    const oneWeekInMillis = 7 * 24 * 60 * 60 * 1000;
    const now = new Date().getTime();
    const inputDate = date.getTime();

    return now - inputDate > oneWeekInMillis;
}

export async function promptForChannelUsername(): Promise<string[]> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const usernamesString: string = await new Promise((resolve) => {
        rl.question('Enter your first channels to scrape (put "," between the usernames if many): ', (answer: string) => {
            rl.close();
            resolve(answer.trim());
        });
    });
    return usernamesString.split(",");
}

export async function signature() {
    const lines = ['Lordofaliens', 'Telegram', 'Scraper'];

    for(const line of lines) {
        await AsciiArt.font(line, 'Doom', (err, rendered) => {
            if (err) {
                console.error('Error generating ASCII art:', err);
                return;
            }
            console.log(rendered);
        });
    }
}