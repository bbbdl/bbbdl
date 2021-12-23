import { IRule } from "../Library/HttpServer/HttpServer";
import Captures from "./Controllers/Captures";
import HomePage from "./Controllers/HomePage";

export default [
	{
		path: "/api/v1/captures/add",
		controller: Captures.add,
	},
	// {

	// }
] as IRule[];
