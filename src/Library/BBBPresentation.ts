import App from "../App";
import * as querystring from "querystring";
import * as url from "url";

export default class BBBPresentation {

	public parsedURL: url.UrlWithStringQuery;
	public meetingId: string;

	public constructor(private urlString: string) {
		this.parsedURL = url.parse(this.urlString);
		const parsedQuery = querystring.parse(this.parsedURL.query);
		this.meetingId = parsedQuery.meetingId as string || undefined;
	}

}