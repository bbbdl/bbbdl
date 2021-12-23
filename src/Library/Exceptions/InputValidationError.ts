import ServerError from "./ServerError";

export default class InputValidationError extends ServerError {
	public code = 400;
	public constructor(public input: string, public type = "") {
		super(`value of "${input}" is not valid`);
		Object.setPrototypeOf(this, InputValidationError.prototype);
	}
	public toJson() {
		return {
			status: false,
			error: "InputValidationError",
			input: this.input,
			type: this.type,
		};
	}
}
