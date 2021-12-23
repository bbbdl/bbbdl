import Capture, {Status as CaptureStatus} from "../Models/Capture";
import BBBRecorder from "./BBBRecorder";

interface IRecording {
	capture: Capture;
	tab: BBBRecorder;

}

export default class CaptureManager {
	public static maxTabs: number = 10;

	private static watchSchedulesInterval: number | NodeJS.Timeout;
	private static recordings: IRecording[] = [];

	public static async init() {
		const captures = await (new Capture)
			.where("status", CaptureStatus.PREPARED)
			.orderBy("id", "ASC")
		.get(this.maxTabs);
		for (const capture of captures) {
			CaptureManager.record(capture);
		}
		CaptureManager.watchSchedules();
	}

	public static async watchSchedules() {
		this.watchSchedulesInterval = setInterval(async () => {
			const diff = this.maxTabs - this.recordings.length;
			if (diff > 0) {
				const captures = await (new Capture)
					.where("status", CaptureStatus.PREPARED)
					.orderBy("id", "ASC")
				.get(diff);
				for (const capture of captures) {
					CaptureManager.record(capture);
				}
			}
		}, 1000);
	}

	public static async record(capture: Capture) {
		const record: IRecording = {
			capture: capture,
			tab: undefined,
		};
		this.recordings.push(record);
		await capture.prepare();

		const tab = new BBBRecorder(capture.original_link);
		record.tab = tab;
		await tab.open();
		await tab.start();

		capture.set("recording_start_at", Math.floor(Date.now() / 1000));
		capture.set("status", CaptureStatus.RECORDING);
		await capture.save();

		setTimeout(() => {
			CaptureManager.stop(capture);
		}, Math.floor((Date.now() / 1000)) + capture.duration);
	}

	public static async stop(capture: Capture): Promise<void> {
		let recordIndex: string;
		let record: IRecording;
		for (const index in this.recordings) {
			if (this.recordings[index] !== undefined) {
				const item = this.recordings[index];
				if (item.capture === capture || item.capture.id === capture.id) {
					recordIndex = index;
					record = item;
					break;
				}
			}
		}
		if (!record) {
			return;
		}
		this.recordings.splice(parseInt(recordIndex, 10), 1);
		capture.set("status", CaptureStatus.STOPPED);
		await Promise.all([capture.save(), record.tab.stop()]);
		const file = await record.tab.save();
		console.log("file = ", file);
		capture.set("movie", file);
		capture.set("status", CaptureStatus.STOPPED);
		return Promise.all([capture.save()]) as any;
	}
}