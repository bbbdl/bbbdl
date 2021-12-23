import { BrowserContext, Target } from "puppeteer";

type ITargetInfoType = "page" | "background_page" | string;

export interface ITargetInfo {
	targetId: string,
    type: ITargetInfoType,
    title: string,
    url: string,
    attached: boolean,
    browserContextId: string;
}

export default interface ITarget extends Target {
	_targetInfo: ITargetInfo;
	_browserContext: BrowserContext;
}
