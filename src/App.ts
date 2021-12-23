import * as fs from "fs";
import * as os from "os";
import * as dotenv from "dotenv";
import * as puppeteer from "puppeteer";
import * as path from "path";
import HttpRouting from "./HttpServer/Routing";
import HttpServer, { ISSLOptions } from "./Library/HttpServer/HttpServer";
import DatabaseManager from "./Library/Database/DatabaseManager";
import ConfigManager from "./Library/ConfigManager";
import { promisify } from "util";
import ITarget from "./types//puppeteer/ITarget";
import CaptureManager from "./Library/CaptureManager";
import Capture, { Status as CaptureStatus } from "./Models/Capture";

export default class App {
	public static async run() {
		if (process.argv.length > 2) {
			const command = process.argv[2];
			switch (command) {
				case "reload":
					this.sendReloadSignal();
					break;
				case "add-meeting":
					const link = process.argv[3] || null;
					if (!link) {
						console.warn(`you should pass a valid BBB recording link as 3th arg!`);
						break;
					}
					App.CWD();
					App.initDotENV();
					App.runDB();
					const id = await this.addMeeting(link);
					console.log(`bbbdl: task saved, id: #${id}`);
					break;
				default:
					console.warn(`bbbdl: '${command}' is not a bbbdl command.`);
				break;
			}
			process.exit();
		}
		App.savePID();
		App.listenForSignals();
		App.CWD();
		App.initDotENV();
		App.runDB();
		await App.loadConfig();
		await App.runHttpServer();
		await App.changeUserGroup();
		await App.runBrowser();

		App.checkForCaptures();
	}
	public static async addMeeting(link: string) {
		const model = new Capture();
		model.set("original_link", link);
		model.set("create_at", Math.floor(Date.now() / 1000));
		model.set("status", CaptureStatus.PENDING);
		await model.save();
		return model.id;
	}
	public static async reload() {
		App.initDotENV();
		/** save ssl cert and key path to DB if gotted from env */
		const sslDB = await App.getConfig().get("https") as ISSLOptions;
		if (!sslDB && (process.env.BBBDL_SSL_CERT_PATH && process.env.BBBDL_SSL_KEY_PATH)) {
			try {
				if (fs.existsSync(process.env.BBBDL_SSL_CERT_PATH) && process.env.BBBDL_SSL_KEY_PATH) {
					App.getConfig().set("https", {
						cert: process.env.BBBDL_SSL_CERT_PATH,
						key: process.env.BBBDL_SSL_KEY_PATH,
					});
				}
			} catch (err) {}
		}
		App.config.clearCache();
		App.config.preload();
		if (App.httpServer) {
			await App.httpServer.stop();
			await App.runHttpServer();
		}
	}
	public static sendReloadSignal() {
		if (App.isDeamonIsRunnig()) {
			const PID = App.getPID();
			console.log(`bbbdl: send 'SIGHUP' signal to PID: '${PID}'`);
			try {
				process.kill(PID, os.constants.signals.SIGHUP);
			} catch (err) {
				console.log("bbbdl: error in send reload signal.\n", err);
				if (err.errno === os.constants.errno.ESRCH) {
					App.removePID();
				}
			}
		} else {
			console.log("bbbdl: bbbdl is not running!");
			App.removePID();
		}
	}
	public static isDeamonIsRunnig(): boolean {
		const PID = App.getPID();
		if (PID) {
			try {
				/** check has process with PID */
				process.kill(PID, 0);
			} catch (err) {
				App.removePID();
				return false;
			}
			return true;
		}
		return false;
	}
	public static getDatabaseManager() {
		return this.databaseManager;
	}
	public static async getBrowser(): Promise<puppeteer.Browser> {
		if (!App.browserIsLocked) {
			return App.browser;
		}
		await new Promise<void>((resolve) => {
			App.browserUnLockPromises.push({
				resolve: resolve,
				lock: false,
			});
		});
		return this.browser;
	}
	public static getConfig() {
		return this.config;
	}
	public static lockBrowser(): Promise<void> {
		if (App.browserIsLocked) {
			const promise = new Promise<void>((resolve) => {
				App.browserUnLockPromises.push({
					resolve: resolve,
					lock: true,
				});
			});
			return promise;
		}
		App.browserIsLocked = true;
		return Promise.resolve();
	}
	public static releaseBrowser() {
		App.browserIsLocked = false;
		while (App.browserUnLockPromises.length) {
			const item = App.browserUnLockPromises.shift();
			item.resolve();
			if (item.lock) {
				App.browserIsLocked = true;
				break;
			}
		}
	}

	private static readonly PID_FILE = "/run/bbbdl/bbbdl.pid";
	public static recorderExtensionTarget: puppeteer.Target;
	private static databaseManager: DatabaseManager;
	private static httpServer: HttpServer;
	private static reconnectBrowserOnDisconnect: boolean = true;
	private static browser: puppeteer.Browser;
	private static recorderExtensionID: string;
	private static config: ConfigManager;
	private static browserIsLocked = false;
	private static browserUnLockPromises: {resolve: () => void, lock: boolean}[] = [];

	protected static listenForSignals() {
		const exitHandler = () => {
			/** no need to close browser, puppeteer handler itself */
			if (App.databaseManager) {
				App.databaseManager.close();
			}
			App.removePID();
			process.exit();
		};
		process.on("SIGINT", () => {
			console.log("bbbdl: got SIGINT signal.");
			exitHandler();
		});
		process.on("SIGTERM", () => {
			console.log("bbbdl: got SIGTERM signal.");
			exitHandler();
		});
		process.on("SIGHUP", () => {
			console.log("bbbdl: got SIGHUP signal, reload 'bbbdl' deamon.");
			App.reload();
		});
	}
	protected static getPID(): number | null {
		if (fs.existsSync(App.PID_FILE)) {
			return parseInt(fs.readFileSync(App.PID_FILE, {
				encoding: "UTF8",
			}), 10);
		}
		return null;
	}
	private static savePID() {
		const dir = path.dirname(App.PID_FILE);
		try {
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir);
			}
			fs.writeFileSync(App.PID_FILE, process.pid.toString(), {
				flag: "w"
			});
		} catch (err) {
			console.log(`bbbdl: can not save pid in ${App.PID_FILE}, error:`, err);
		}
	}
	private static removePID() {
		if (fs.existsSync(App.PID_FILE)) {
			try {
				fs.unlinkSync(App.PID_FILE);
			} catch (err) {
				console.error(`bbbdl: can not remove PID file located in: '${App.PID_FILE}', Error:\n`, err);
			}
		}
	}

	private static initDotENV() {
		const env = path.resolve(__dirname, "../.env");
		if (fs.existsSync(env)) {
			const content = fs.readFileSync(env, {
				encoding: "UTF8",
			});
			const envConfig = dotenv.parse(content);
			for (const key in envConfig) {
				if (envConfig[key] !== undefined) {
					process.env[key] = envConfig[key];
				}
			}
		}
	}

	private static runDB() {
		if (!App.databaseManager) {
			App.databaseManager = new DatabaseManager({
				host: process.env.BBBDL_DB_HOST || "127.0.0.1",
				username: process.env.BBBDL_DB_USERNAME || "YOUR_USER",
				password: process.env.BBBDL_DB_PASSWORD || "PASSWORD",
				database: process.env.BBBDL_DB_NAME ||"DATABASE_NAME",
				charset: process.env.BBBDL_DB_CHARSET || "utf8mb4",
			});
		}
	}


	private static async runHttpServer() {
		const port: number = process.env.BBBDL_PORT ?
			parseInt(process.env.BBBDL_PORT, 10) :
			await App.getConfig().get("http_port", 80) as number;

		const hostname: string = process.env.BBBDL_HOSTNAME ||
			await App.getConfig().get("http_hostname") as string;

		const ssl: ISSLOptions = (process.env.BBBDL_SSL_CERT_PATH && process.env.BBBDL_SSL_KEY_PATH) ? {
			cert: process.env.BBBDL_SSL_CERT_PATH,
			key: process.env.BBBDL_SSL_KEY_PATH,
			port: process.env.BBBDL_SSL_PORT ? parseInt(process.env.BBBDL_SSL_PORT) : 443,
			redirect: [1, "1", "true", "yes", "on"].indexOf(process.env.BBBDL_SSL_REDIRECT) > -1,
		} : await App.getConfig().get("https") as ISSLOptions;

		let shouldUseSSL: boolean = true;
		if (ssl && ssl.cert && ssl.key) {
			try {
				if (!fs.existsSync(ssl.cert) || !fs.existsSync(ssl.key)) {
					shouldUseSSL = false;
				}
			} catch (err) {
				shouldUseSSL = false;
			}
		}

		const config = {
			port: port,
			hostname: hostname,
			ssl: shouldUseSSL ? ssl : undefined,
		};
		App.httpServer = new HttpServer(HttpRouting, config);
		await App.httpServer.run();
	}
	private static async runBrowser() {
		/**
		 * we should filter env variables that puppeteer sees
		 * Because by default it sees all process.env and it's not good to expose information like DB, ...
		 * @see https://github.com/puppeteer/puppeteer/blob/v9.1.1/docs/api.md#puppeteerlaunchoptions
		 */
		const secretENVs = [
			"BBBDL_DB_HOST", "BBBDL_DB_USERNAME", "BBBDL_DB_NAME", "BBBDL_DB_PASSWORD", "BBBDL_MYSQL_ROOT_PASSWORD",
			"BBBDL_CERTBOT_EMAIL", "BBBDL_SSL_CERT_PATH", "BBBDL_SSL_KEY_PATH",
			"BBBDL_HOSTNAME", "BBBDL_PORT", "BBBDL_SSL_PORT",
		];
		const puppeteerENV: {[name: string]: string} = {};
		for (const key in process.env) {
			if (secretENVs.indexOf(key) === -1) {
				puppeteerENV[key] = process.env[key];
			}
		}

		const pathToRecorderExtension = path.join(__dirname, "recorder-google-chrome-extension");
		const recorderExtensionManifestContent = fs.readFileSync(`${pathToRecorderExtension}/manifest.json`, {
			encoding: "UTF8",
		});
		const recorderExtensionManifest: {
			name: string;
			[key: string]: string | any;
		} = JSON.parse(recorderExtensionManifestContent);

		const puppeteerOptions: puppeteer.LaunchOptions = {
			env: puppeteerENV,

			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-dev-shm-usage",
				// `--whitelisted-extension-id=mmijlbbbhgjcbeinnnjjhflfobldddkc`,
				`--load-extension=${pathToRecorderExtension}`,
				`--disable-extensions-except=${pathToRecorderExtension}`,
			],

			/**
			 * Extensions in Chrome / Chromium currently only work in non-headless mode.
			 * @see: https://github.com/puppeteer/puppeteer/blob/main/docs/api.md#working-with-chrome-extensions
			 */
			headless: false,
			// headless: true,
		};

		const setupPuppeteer = async (options?: puppeteer.LaunchOptions) => {
			console.log("bbbdl: App.runBrowser(): setupPuppeteer");
			App.browser = await puppeteer.launch(options);
			console.log(`bbbdl: puppeteer started with pid: ${App.browser.process().pid}`);

			App.browser.on("disconnected", () => {
				console.log("bbbdl: App.browser disconnected");
				if (App.reconnectBrowserOnDisconnect) {
					console.log("bbbdl: try reconnect App.browser");
					setupPuppeteer(puppeteerOptions);
				}
			});

			const targets = await App.browser.targets();
			App.recorderExtensionTarget = targets.find((target: ITarget) => {
				return target.type() === "background_page" && target._targetInfo.title === recorderExtensionManifest.name;
			});

			const url = App.recorderExtensionTarget.url();
			const id = url.substr("chrome-extension://".length);
			App.recorderExtensionID = id.indexOf("/") === -1 ? id : id.substr(0, id.indexOf("/"));
			console.log("App.recorderExtensionID", App.recorderExtensionID);
		}

		/**
		 * setup puppeteer first to find recorder extension id and resetup again with new args
		 * this is needed for make recorder functional! if not pass 'whitelisted-extension-id' args, we got some error like this:
		 * 	'Evaluation failed: Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured.'
		 */
		await setupPuppeteer(puppeteerOptions);
		App.reconnectBrowserOnDisconnect = false;
		await App.browser.close();
		App.reconnectBrowserOnDisconnect = true;

		puppeteerOptions.args.push(`--whitelisted-extension-id=${App.recorderExtensionID}`);
		await setupPuppeteer(puppeteerOptions);
	}


	private static loadConfig() {
		if (!App.config) {
			App.config = new ConfigManager();
		}
		return App.config.preload();
	}

	private static async changeUserGroup() {
		const options: string[] = await Promise.all([App.getConfig().get("process_user"), App.getConfig().get("process_group")]);
		if (options[1] && process.getgid && process.setgid) {
			process.setgid(options[1]);
		}
		if (options[0] && process.getuid && process.setuid) {
			process.setuid(options[0]);
		}
	}
	private static CWD() {
		process.chdir(__dirname);
	}
	private static async checkForCaptures() {
		CaptureManager.init();
	}

	public static async test() {
		const browser = await App.getBrowser();

		const page = await browser.newPage();

		await page.goto('http://vclb.iaun.ac.ir/playback/presentation/2.0/playback.html?meetingId=9f5d0601ee041f48acaadc91f446cef83d0050f4-1621231149193', { waitUntil: 'domcontentloaded' });

		await page.waitForSelector(".acorn-play-button, .vjs-play-control", {
			visible: true,
		});
		await page.click(".acorn-play-button, .vjs-play-control", {})

		const backgroundPage = await App.recorderExtensionTarget.page();
		backgroundPage.on('console', (msg) => {
			console.log("backgroundPage:console", msg.text()), "\n\n\n";
		});

		await promisify(setTimeout)(2000);

		const tab1 = await backgroundPage.evaluate(() => {
			return RecorderExtension.getActiveTab();
		});

		await backgroundPage.evaluate(() => {
			return RecorderExtension.start();
		});
		// await page.waitFor(45 * 1000);



		const page2 = await browser.newPage();
		await page2.goto('http://vclb.iaun.ac.ir/playback/presentation/2.0/playback.html?meetingId=a1d548293ea0d88931af1a6437adbc68f71dcc75-1621403798332', { waitUntil: 'domcontentloaded' });
		await page2.waitForSelector(".acorn-play-button, .vjs-play-control", {
			visible: true,
		});
		await page2.click(".acorn-play-button, .vjs-play-control", {})
		const tab2 = await backgroundPage.evaluate(() => {
			return RecorderExtension.getActiveTab();
		});
		await backgroundPage.evaluate(() => {
			return RecorderExtension.start();
		});
		// await page2.waitFor(25 * 1000);

		{
			setTimeout(async () => {
				await backgroundPage.evaluate((tabID) => {
					return RecorderExtension.stop(tabID);
				}, tab1);
				const file = await backgroundPage.evaluate((tabID) => {
					return RecorderExtension.save(tabID);
				}, tab1);
	
				console.log("file1 = ", file);

			}, 45_000)
		}
		{
			setTimeout(async () => {
				await backgroundPage.evaluate((tabID) => {
					return RecorderExtension.stop(tabID);
				}, tab2);
				const file = await backgroundPage.evaluate((tabID) => {
					return RecorderExtension.save(tabID);
				}, tab2);
				console.log("file2 = ", file);

			}, 30_000);
		}
		// await browser.close();
		
	}
}
