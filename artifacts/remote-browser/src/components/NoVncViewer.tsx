import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import RFB from "@novnc/novnc";

type ViewerState = "connecting" | "connected" | "error";

export type NoVncViewerHandle = {
  openNewWindow: () => boolean;
};

type NoVncViewerProps = {
  url: string;
  onState: (state: ViewerState) => void;
  onError: (message: string) => void;
};

export const NoVncViewer = forwardRef<NoVncViewerHandle, NoVncViewerProps>(
  function NoVncViewer({ url, onState, onError }, ref) {
  const targetRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const onStateRef = useRef(onState);
  const onErrorRef = useRef(onError);

  useImperativeHandle(ref, () => ({
    openNewWindow() {
      const rfb = rfbRef.current;
      if (!rfb) return false;

      rfb.sendKey(0xffe3, "ControlLeft", true);
      rfb.sendKey(0x006e, "KeyN", true);
      rfb.sendKey(0x006e, "KeyN", false);
      rfb.sendKey(0xffe3, "ControlLeft", false);
      return true;
    },
  }), []);

  useEffect(() => {
    onStateRef.current = onState;
    onErrorRef.current = onError;
  }, [onState, onError]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    onStateRef.current("connecting");
    onErrorRef.current("");
    const rfb = new RFB(target, url);
    rfbRef.current = rfb;
    rfb.scaleViewport = true;
    rfb.clipViewport = false;
    rfb.resizeSession = false;
    rfb.focusOnClick = true;
    rfb.background = "#080a0c";

    const onConnect = () => onStateRef.current("connected");
    const onDisconnect = (event: Event) => {
      const clean = Boolean(
        (event as CustomEvent<{ clean?: boolean }>).detail?.clean,
      );
      onStateRef.current(clean ? "connecting" : "error");
      if (!clean) {
        onErrorRef.current("The local browser display disconnected. Check that the computer and Cloudflare Tunnel are still running.");
      }
    };
    const onSecurityFailure = () => {
      onStateRef.current("error");
      onErrorRef.current("The local VNC display rejected the connection. Restart the local browser setup and try again.");
    };

    rfb.addEventListener("connect", onConnect);
    rfb.addEventListener("disconnect", onDisconnect);
    rfb.addEventListener("securityfailure", onSecurityFailure);

    return () => {
      if (rfbRef.current === rfb) rfbRef.current = null;
      rfb.disconnect();
    };
  }, [url]);

  return (
    <div
      ref={targetRef}
      className="h-full w-full overflow-hidden bg-[#080a0c] [&_canvas]:block [&_canvas]:h-full [&_canvas]:max-h-full [&_canvas]:max-w-full [&_canvas]:w-full [&_canvas]:object-contain"
      aria-label="Remote Chromium desktop"
      data-testid="novnc-viewer"
    />
  );
  },
);
