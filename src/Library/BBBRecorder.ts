import App from "../App";
import { Browser, Page, ElementHandle } from "puppeteer";
import { fail } from "assert";

declare const RecorderExtension: {
	getActiveTab(): number;
	start(): void;
	stop(tabID?: number): Promise<void>;
	pause(tabID?: number): void;
	resume(tabID?: number): void;
	save(tabID?: number): string;
};

export default class BBBRecorder {
	private browser: Browser;
	private page: Page;
	private backgroundPage: Page;
	private tab: number;

	public constructor(private url: string) {}

	public async open() {
		this.browser = await App.getBrowser();
		await App.lockBrowser();
		this.page = await this.browser.newPage();
		App.releaseBrowser();

		await this.page.goto(this.url, {waitUntil: 'networkidle2'});
		
		await this.page.waitForSelector(".acorn-play-button, .vjs-play-control", {
			visible: true,
		});
		await this.page.click(".acorn-play-button, .vjs-play-control", {})

		this.backgroundPage = await App.recorderExtensionTarget.page();
		this.backgroundPage.on('console', (msg) => {
			console.log(msg.text());
		});
	}
	public async start() {
		await App.lockBrowser();
		await this.page.bringToFront();
		this.tab = await this.backgroundPage.evaluate(() => {
			return RecorderExtension.getActiveTab();
		});
		console.log("this.tab = ", this.tab);
		await this.backgroundPage.evaluate(() => {
			return RecorderExtension.start();
		});
		App.releaseBrowser();
	}
	public pause() {
		return this.backgroundPage.evaluate((tabID) => {
			return RecorderExtension.pause(tabID);
		}, this.tab);
	}
	public async stop() {
		await this.backgroundPage.evaluate(async (tabID) => {
			await RecorderExtension.stop(tabID);
		}, this.tab);
	}
	public save() {
		return this.backgroundPage.evaluate((tabID) => {
			return RecorderExtension.save(tabID);
		}, this.tab);
	}
	public close() {
		return this.page.close();
	}
}