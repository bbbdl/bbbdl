import * as path from "path";
import Model, {ColumnType, RelationType} from "../Library/Database/Model";
import MeetingDownloader from "../Library/BBB/MeetingDownloader";
import Callback from "./Capture/Callback";

export enum Status {
	PENDING,
	PREPARING,
	PREPARED,
	RECORDING,
	STOPPED,
	RECORDED,
	DONE,
}

export default class Capture extends Model {
	public readonly id: number;
	public readonly original_link: string;
	public readonly duration: number;
	public readonly recording_start_at?: number;
	public readonly recording_end_at?: number;
	public readonly paused?: boolean;
	public readonly tab?: number;
	public readonly movie?: string;
	public readonly status: Status;

	public readonly callbacks: Promise<Callback[]>;

	public async prepare() {
		if (!this.original_link || !this.original_link.length) {
			return;
		}
		const urlObject = new URL(this.original_link);
		const downloader = new MeetingDownloader(
			`${urlObject.origin}/presentation/${urlObject.searchParams.get('meetingId')}`,
			path.resolve(__dirname, `../../storage/${urlObject.host}/presentation/${urlObject.searchParams.get('meetingId')}`)
		);
		return downloader.start();
	}

	protected table() {
		return "captures";
	}

	protected columns() {
		return [
			{name: "id", type: ColumnType.Int, autoIncrement: true, primary: true},
			{name: "original_link", type: ColumnType.Varchar, length: 255},
			{name: "duration", type: ColumnType.Int, nullable: true},
			{name: "recording_start_at", type: ColumnType.Int, nullable: true},
			{name: "recording_end_at", type: ColumnType.Int, nullable: true},
			{name: "tab", type: ColumnType.Int, nullable: true},
			{name: "movie", type: ColumnType.Varchar,  length: 255, nullable: true},
			{name: "create_at", type: ColumnType.Int, unsinged: true},
			{name: "status", type: ColumnType.TinyInt},
		];
	}

	protected relations() {
		return [];
	}
}
