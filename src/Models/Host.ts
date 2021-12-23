import Model, {ColumnType, RelationType} from "../Library/Database/Model";
import Capture from "./Capture";

export default class Host extends Model {
	public readonly id: number;
	public readonly username: string;

	protected table() {
		return "hosts";
	}
	protected columns() {
		return [
			{name: "id", type: ColumnType.Int, autoIncrement: true, primary: true},
			{name: "username", type: ColumnType.Varchar, length: 10, unique: true},
		];
	}
}
