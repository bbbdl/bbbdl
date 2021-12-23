import * as bent from "bent";

interface IFetchRoomResult {
	domain: string;
	server: string;
	upload_url: string;
	customer_id: string;
	room_id: string;
	version: string;
}
export default class SkyRoomAPI {
	public async fetchRoom(endpoint: string, room: string, customer: string): Promise<IFetchRoomResult> {
		let response: any = await bent("string", "POST")(endpoint, {
			customer,
			room,
			gadget: "Skyroom",
			action: "FetchRoom"
		});
		response = Buffer.from(response, "base64").toString("utf8");
		response = JSON.parse(response);
		if (response.ok) {
			return response.result;
		}
	}
}