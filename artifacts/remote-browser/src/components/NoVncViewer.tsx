import { useEffect, useRef } from "react";
import RFB from "@novnc/novnc";

type ViewerState = "connecting" | "connected" | "error";

export function NoVncViewer({
  url,
  onState,
  onError,
}: {
  url: string;
  onState: (state: ViewerState) => void;
  onError: (message: string) => void;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const onStateRef = useRef(onState);
  const onErrorRef = useRef(onError);

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
    rfb.scaleViewport = true;
    rfb.clipViewport = true;
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
      rfb.disconnect();
    };
  }, [url]);

  return (
    <div
      ref={targetRef}
      className="h-full min-h-[calc(100dvh-106px)] w-full overflow-hidden bg-[#080a0c] [&_canvas]:block [&_canvas]:h-full [&_canvas]:max-h-[calc(100dvh-106px)] [&_canvas]:max-w-full [&_canvas]:object-contain"
      aria-label="Remote Chromium desktop"
      data-testid="novnc-viewer"
    />
  );
}
