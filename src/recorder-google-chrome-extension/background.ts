interface IDownloadListener {
	id: number;
	listener: (downloadDelta: chrome.downloads.DownloadDelta) => boolean; // return true to remove listener
}
interface ITab {
	id: number;
	recorder?: MediaRecorder;
	stream?: MediaStream;
	chunks: Blob[];
}
class RecorderExtension {
	private static tabs: ITab[] = [];
	private static mimeType: string = "video/webm; codecs=vp9";
	private static downloadListeners: IDownloadListener[] = [];

	public static init() {
		this.initDownloadListener();
	}
	public static getActiveTab(): Promise<number> {
		return new Promise((resolve, rejrect) => {
			chrome.tabs.query({active: true}, (tabs) => {
				if (tabs.length < 1) {
					console.log("reject::::no active tab")
					return rejrect("no active tab");
				}
				console.log("tabs[0]", tabs[0].id, tabs[0].url)
				resolve(tabs[0].id);
				console.log(JSON.stringify(tabs));
			});
		});
	}
	public static async start(tabID?: number): Promise<void> {
		const tab = this.getTab(tabID !== undefined ? tabID : await this.getActiveTab());
		const recorder = await this.getRecorder(tab);
		if (recorder.state !== "recording") {
			recorder.start(5 * 1000);
		}
	}
	public static async stop(tabID?: number) {
		const tab = this.getTab(tabID !== undefined ? tabID : await this.getActiveTab());
		const killStream = () => {
			if (tab.stream) {
				for (const track of tab.stream.getTracks()) {
					track.stop();
				}
				tab.stream = undefined;
			}
		};
		if (!tab.recorder) {
			killStream();
			return;
		}
		return new Promise<void>((resolve, reject) => {
			tab.recorder.onstop = () => {
				resolve();
				killStream();
				tab.recorder = undefined;
			};
			tab.recorder.onerror = (err) => {
				reject(err);
				killStream();
			};
			tab.recorder.stop();
		});
	}
	public static async pause(tabID?: number) {
		const tab = this.getTab(tabID !== undefined ? tabID : await this.getActiveTab());
		const recorder = await this.getRecorder(tab);
		recorder.pause();
	}
	public static async resume(tabID?: number) {
		const tab = this.getTab(tabID !== undefined ? tabID : await this.getActiveTab());
		const recorder = await this.getRecorder(tab);
		recorder.resume();
	}
	public static async save(tabID?: number): Promise<string> {
		const tab = this.getTab(tabID !== undefined ? tabID : await this.getActiveTab());
		return new Promise((resolve, reject) => {
			const movie = new Blob(tab.chunks, {type: this.mimeType});
			const url = window.URL.createObjectURL(movie);
			chrome.downloads.download({
				url: url,
			}, (id) => {
				window.URL.revokeObjectURL(url);
				if (!id) {
					return reject(chrome.runtime.lastError);
				}
				let filePath: string;
				let state: string;
				this.downloadListeners.push({
					id: id,
					listener: (download) => {
						if (download.filename !== undefined && download.filename.current) {
							filePath = download.filename.current;
						}
						if (download.state !== undefined && download.state.current) {
							state = download.state.current;
						}
						if (state === "interrupted") {
							reject("download interrupted");
							return true;
						} else if (state === "complete") {
							resolve(filePath);
							return true;
						}
					},
				} as IDownloadListener);
			});
		});
	}

	private static getTab(chrometTab: number): ITab {
		for (const item of this.tabs) {
			if (item.id === chrometTab) {
				return item;
			}
		}
		const tab: ITab = {
			id: chrometTab,
			chunks: [],
		};
		this.tabs.push(tab);
		return tab;
	}
	private static async getMediaStream(tab: ITab): Promise<MediaStream> {
		if (tab.stream !== undefined) {
			return Promise.resolve(tab.stream);
		}
		return new Promise((resolve, reject) => {
			chrome.tabCapture.capture({
				audio: true,
				video: true,
			}, (stream) => {
				if (stream === null) {
					console.log("recorder: getMediaStream: reject:", chrome.runtime.lastError.message)
					return reject(chrome.runtime.lastError);
				}
				tab.stream = stream;
				resolve(tab.stream);
			});
		});
	}
	private static async getRecorder(tab: ITab): Promise<MediaRecorder> {
		if (tab.recorder !== undefined) {
			return tab.recorder;
		}
		const stream = await this.getMediaStream(tab);
		tab.recorder = new MediaRecorder(stream, {
			mimeType: this.mimeType,
		});
		tab.recorder.addEventListener("dataavailable", (event: BlobEvent) => {
			tab.chunks.push(event.data);
		});
		return tab.recorder;
	}
	private static initDownloadListener() {
		chrome.downloads.onChanged.addListener((download) => {
			for (let x = 0, l = this.downloadListeners.length; x < l; x++) {
				if (this.downloadListeners[x].id === download.id) {
					const shouldDelete = this.downloadListeners[x].listener(download);
					if (shouldDelete === true) {
						this.downloadListeners.splice(x, 1);
					}
					break;
				}
			}
		});
	}
}

RecorderExtension.init();
