import * as fs from "fs";
import * as http from "http";
import * as mime from "mime";
import * as stream from "stream";
import * as url from "url";
import * as querystring from "querystring";
import View from "../MVC/View";
import HttpServer from "./HttpServer";
import {IData} from "../InputValidation";

export default class Client {
	private static readonly MAX_BODY_SIZE = 100 * 1024;

	public host: string;
	public path: string;
	public url: url.UrlWithParsedQuery;
	public data: IData;
	public body: Buffer;
	public constructor(private server: HttpServer, private request: http.IncomingMessage, private response: http.ServerResponse, public isHttps: boolean) {
		this.host = request.headers.host;
		this.path = request.url;
		this.url = url.parse((this.isHttps ? "https" : "http") + "://" + this.host + request.url, true);
	}
	public sendNotFound() {
		this.server.notFoundPage().then((notfound) => {
			this.response.writeHead(404, {"Content-Type": "text/html"});
			this.response.end(notfound);
		});
	}
	public send(chunk: string | Buffer | ArrayBuffer) {
		this.response.end(chunk);
	}
	// tslint:disable:ban-types
	public async sendView(view: Function | View) {
		const obj: View = (view instanceof View) ? view : new (view.prototype.constructor)();
		try {
			await obj.preLoad();
			if (typeof this.url.query.ajax === "string" && this.url.query.ajax === "1") {
				const json = await obj.forAjax();
				this.sendJSON(json);
			} else {
				const html = await obj.render();
				this.response.writeHead(200, {"Content-Type": "text/html"});
				this.response.end(html);
			}
		} catch (e) {
			console.error(e);
			this.response.writeHead(500, {"Content-Type": "text/html"});
			this.response.end();
		}
	}
	public sendStream(size: number, readableStream: stream.Readable, mimeType: string) {
		this.response.writeHead(200, {"Content-Type": mimeType, "Content-Length": size});
		readableStream.pipe(this.response);
	}
	public sendFile(path: string) {
		return new Promise<void>((resolve, reject) => {
			const contentType = mime.getType(path) || "application/octet-stream";
			fs.stat(path, (err, stats) => {
				if (err) {
					this.response.writeHead(500, {"Content-Type": "text/html"});
					return reject(err);
				}
				this.sendStream(stats.size, fs.createReadStream(path), contentType);
				resolve();
			});
		});
	}
	public sendJSON(data: any, code?: number) {
		this.response.writeHead(code || 200, {"Content-Type": "application/json; charset=utf-8"});
		this.response.end(JSON.stringify(data));
	}
	public redirect(newURL: string, code: 301 | 302 = 302) {
		this.response.writeHead(code, {
			Location: newURL,
		});
		this.response.end();
	}

	public parseBody(): Promise<void> {
		console.log("client.parseBody")
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			let size = 0;
			this.request.on("data", (chunk: Buffer) => {
				console.log('this.request.on("data"')
				if (size + chunk.length < Client.MAX_BODY_SIZE) {
					chunks.push(chunk);
					size += chunk.length;
				} else {
					this.response.writeHead(400, {"Content-Type": "text/html"});
					this.response.end("");
				}
				if (chunk.length > 1e6) {
					this.request.connection.destroy();
        		}
			});
			this.request.on("end", () => {
				this.body = size ? Buffer.concat(chunks) : undefined;
				console.log('this.request.on("end"', this.body);
				if (!this.body.length) {
					return resolve();
				}
				this.data = querystring.parse(this.body.toString("utf8")) as IData;
				// if (this.request.headers["content-type"].indexOf("json") !== -1) {
				// 	try {
				// 		this.data = JSON.parse(this.body.toString("utf8"));
				// 	} catch (e) {
				// 		this.response.writeHead(400, {"Content-Type": "text/html"});
				// 		this.response.end();
				// 	}
				// } else if (this.request.headers["content-type"].indexOf("form-urlencoded") !== -1) {
				// 	try {
				// 		this.data = querystring.parse(this.body.toString("utf8")) as IData;
				// 	} catch (e) {
				// 		this.response.writeHead(400, {"Content-Type": "text/html"});
				// 		this.response.end();
				// 	}
				// }
				resolve();
			});
		});
	}
}
