import SkyroomAPI from "../../Library/SkyroomAPI";
import Capture, {Status as CaptureStatus} from "../../Models/Capture";
import Client from "../../Library/HttpServer/Client";
import InputValidation, { InputType } from "../../Library/InputValidation";
import InputValidationError from "../../Library/Exceptions/InputValidationError";

enum ErrorType {
	RESOLVE,
	TIMEOUT,
	INTERNAL,
}
interface IData {
	classID: number;
	username: string;
	password: string;
	start: number;
	end: number;
}
export default class Captures {
	public static async add(client: Client) {
		// console.log("client", client, "\n\n\n", client.data)
		const validator = new InputValidation({
			link: {
				type: InputType.String,
				required: true,
			},
			email: {
				type: InputType.String,
				required: true,
			},
			callbackURL: {
				type: InputType.String,
				required: false,
			},
		}, client.data || {});
		const data = validator.validate() as IData;

		return client.sendJSON({
			status: true,
		});
	}
}
