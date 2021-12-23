import Model, {ColumnType, RelationType} from "../../Library/Database/Model";
import Capture from "../Capture";

export enum Status {
	PENDING,
	DONE,
}

export default class Callback extends Model {
	public readonly id: number;
	public readonly capture_id: string;
	public readonly status: Status;

	protected table() {
		return "captures_callbacks";
	}

	protected columns() {
		return [
			{name: "id", type: ColumnType.Int, autoIncrement: true, primary: true},
			{name: "capture_id", type: ColumnType.Int},
			{name: "value", type: ColumnType.Text},
			{name: "response", type: ColumnType.Text},
			{name: "status", type: ColumnType.TinyInt},
		];
	}

	protected relations() {
		return [
			{relation: RelationType.OneToOne, column: "capture_id", model: Capture},
		];
	}
}
