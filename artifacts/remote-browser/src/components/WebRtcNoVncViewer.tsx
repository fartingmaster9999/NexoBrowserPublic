import { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";

type ViewerState = "connecting" | "connected" | "error";

function waitForIceGathering(peer: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const finish = () => {
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", checkState);
      if (peer.iceGatheringState === "complete") resolve();
      else reject(new Error("Could not gather WebRTC connection details."));
    };
    const checkState = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    peer.addEventListener("icegatheringstatechange", checkState);
  });
}

export function WebRtcNoVncViewer({
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
  const [phase, setPhase] = useState<ViewerState>("connecting");

  useEffect(() => {
    onStateRef.current = onState;
    onErrorRef.current = onError;
  }, [onState, onError]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    let disposed = false;
    let failing = false;
    let peer: RTCPeerConnection | undefined;
    let signaling: WebSocket | undefined;
    let rfb: RFB | undefined;
    let connectionTimeout: number | undefined;

    onStateRef.current("connecting");
    onErrorRef.current("");
    setPhase("connecting");

    const fail = (message: string) => {
      if (disposed || failing) return;
      failing = true;
      setPhase("error");
      onStateRef.current("error");
      onErrorRef.current(message);
      rfb?.disconnect();
      peer?.close();
      signaling?.close();
    };

    try {
      peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      const dataChannel = peer.createDataChannel("rfb", { ordered: true });
      dataChannel.binaryType = "arraybuffer";

      // noVNC supports RTCDataChannel here; its bundled typings still only
      // describe the string/WebSocket overload.
      rfb = new RFB(target, dataChannel as unknown as string);
      rfb.scaleViewport = true;
      rfb.clipViewport = false;
      rfb.resizeSession = false;
      rfb.focusOnClick = true;
      rfb.background = "#080a0c";

      rfb.addEventListener("connect", () => {
        if (disposed || failing) return;
        if (connectionTimeout !== undefined) {
          window.clearTimeout(connectionTimeout);
          connectionTimeout = undefined;
        }
        setPhase("connected");
        onErrorRef.current("");
        onStateRef.current("connected");
      });
      rfb.addEventListener("disconnect", (event) => {
        if (disposed || failing) return;
        const clean = Boolean(
          (event as CustomEvent<{ clean?: boolean }>).detail?.clean,
        );
        if (!clean) {
          fail("The direct browser connection disconnected.");
        }
      });
      rfb.addEventListener("securityfailure", () => {
        fail("The remote browser rejected the connection.");
      });

      peer.onconnectionstatechange = () => {
        if (peer?.connectionState === "failed") {
          fail("A direct WebRTC connection could not be established. Try the standard connection.");
        }
      };

      signaling = new WebSocket(url);
      signaling.onopen = async () => {
        try {
          if (!peer || !signaling || disposed) return;
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await waitForIceGathering(peer, 12_000);
          if (
            signaling.readyState !== WebSocket.OPEN ||
            !peer.localDescription?.sdp
          ) {
            throw new Error("WebRTC signaling closed before the offer was sent.");
          }
          signaling.send(
            JSON.stringify({ type: "offer", sdp: peer.localDescription.sdp }),
          );
        } catch {
          fail("Could not prepare a direct WebRTC connection. Try the standard connection.");
        }
      };
      signaling.onmessage = async (event) => {
        try {
          if (!peer || disposed) return;
          const message: unknown = JSON.parse(String(event.data));
          if (
            !message ||
            typeof message !== "object" ||
            !("type" in message)
          ) {
            throw new Error("Invalid WebRTC response.");
          }
          if (message.type === "error") {
            fail(
              "A direct WebRTC connection could not be established. Try the standard connection.",
            );
            return;
          }
          if (
            message.type !== "answer" ||
            !("sdp" in message) ||
            typeof message.sdp !== "string"
          ) {
            throw new Error("Invalid WebRTC answer.");
          }
          await peer.setRemoteDescription({
            type: "answer",
            sdp: message.sdp,
          });
        } catch {
          fail("The direct WebRTC connection could not be negotiated.");
        }
      };
      signaling.onerror = () => {
        fail("The direct browser signaling connection failed.");
      };
      connectionTimeout = window.setTimeout(() => {
        fail("The direct connection is taking too long. Try the standard connection.");
      }, 30_000);
    } catch {
      fail("WebRTC could not start in this browser. Try the standard connection.");
    }

    return () => {
      disposed = true;
      if (connectionTimeout !== undefined) {
        window.clearTimeout(connectionTimeout);
      }
      rfb?.disconnect();
      peer?.close();
      signaling?.close();
    };
  }, [url]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#080a0c]" data-testid="webrtc-novnc-viewer">
      <div
        ref={targetRef}
        className="absolute inset-0 overflow-hidden [&_canvas]:block [&_canvas]:h-full [&_canvas]:max-h-full [&_canvas]:max-w-full [&_canvas]:w-full [&_canvas]:object-contain"
        aria-label="Remote Chromium desktop over WebRTC"
      />
      {phase === "connecting" && <span className="pointer-events-none absolute bottom-4 left-4 rounded bg-[#111416]/90 px-3 py-2 text-xs text-[#c8d0d5]">
        Connecting directly over WebRTC…
      </span>}
      {phase === "connected" && <span className="pointer-events-none absolute bottom-4 left-4 rounded bg-[#111416]/75 px-2 py-1 text-[10px] text-[#aeb8be]">
        Direct WebRTC
      </span>}
    </div>
  );
}
