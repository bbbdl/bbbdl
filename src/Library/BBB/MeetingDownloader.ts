import axios from "axios";
import * as fs from "fs";
import { dirname } from "path";
import * as xml2js from "xml2js";

export default class MeetingDownloader {

	public constructor(protected baseURL: string, protected targetDirectory: string) {}

	public async start(): Promise<void> {
		await this.downloadPlainFiles();
		await this.downloadSlides()
	}

	protected downloadPlainFiles(): Promise<void> {
		return new Promise((resolve) => {
			const promises = [];
			let done = 0;
			for (const file of [
				// "captions.json",
				// "cursor.xml",
				// "deskshare.xml",
				"metadata.xml",
				// "panzooms.xml",
				// "presentation_text.json",
				// "shapes.svg",
				// "slides_new.xml",
				// "video/webcams.webm",
				// "video/webcams.mp4",
				// "video/deskshare.webm",
				// "video/deskshare.mp4",
			]) {
				const promise = this.downloadFile(file, file);
				promise.then(() => {
					console.log(`\`${file}\` successfully downloaded.`);
				}).catch((err) => {
					console.error(`\`${file}\`: ${err}`);
				}).finally(() => {
					done++;
					if (done === promises.length) {
						resolve();
					}
				});
				promises.push(promises);
			}
		});
	}

	protected async downloadFile(url: string, target: string): Promise<void> {
		const path = `${this.targetDirectory}/${target}`;
		const dir = dirname(path);
		try {
			await fs.promises.access(dir);
		} catch (e) {
			await fs.promises.mkdir(dir, {
				recursive: true
			});
		}
		try {
			const stat = await fs.promises.stat(path);
			if (stat.size > 0) {
				console.log(path + " already exists");
				return;
			}
		} catch(e) {
		}
		const stream = fs.createWriteStream(path);
		try {
			const response = await axios({
				method: 'get',
				url: `${this.baseURL}/${url}`,
				responseType: 'stream'
			});
			const closePromise =  new Promise<void>((resolve) => {
				response.data.on("close", () => {
					resolve();
				});
			});
			response.data.pipe(stream);
			await closePromise;
		} catch (e) {
			await fs.promises.unlink(path);
			throw e;
		}
	}

	protected async downloadSlides(): Promise<void> {
		const file = await fs.promises.readFile(`${this.targetDirectory}/shapes.svg`);
		const xml = await xml2js.parseStringPromise(file.toString("utf-8"));
		const urls: string[] = [];
		for (const $image of xml.svg.image) {
			urls.push($image.$["xlink:href"]);
		}
		console.log(urls);

		const promises = [];
		for (let src of urls) {
			/* if (src.startsWith("presentation/")) {
				src = src.substr("presentation/".length);
			} */

			const promise = this.downloadFile(src, src).then(() => {
				console.log(`\`${src}\` successfully downloaded.`);
			}).catch((err) => {
				console.error(`\`${src}\`: ${err}`);
			});
			promises.push(promise);
		}
		await Promise.all(promises);
	}
}
