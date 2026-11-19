declare module "@novnc/novnc" {
  export default class RFB {
    constructor(target: HTMLElement, url: string);
    scaleViewport: boolean;
    clipViewport: boolean;
    resizeSession: boolean;
    focusOnClick: boolean;
    background: string;
    disconnect(): void;
    addEventListener(
      type: "connect" | "disconnect" | "securityfailure",
      listener: (event: Event) => void,
    ): void;
  }
}
