import { Router, type IRouter, type Response } from "express";
import {
  CreateBrowserPairingResponse,
  CreateBrowserViewerTicketResponse,
  GetBrowserStatusResponse,
} from "@workspace/api-zod";
import { requireBrowserOwner } from "../middlewares/requireBrowserOwner";
import {
  createPairing,
  createViewerTicket,
  getBrowserStatus,
  stopBrowserSession,
} from "../lib/browserBroker";
import {
  closeLocalVncViewer,
  isVncServerAvailable,
} from "../lib/localVnc";

const router: IRouter = Router();

function ownerId(res: Response): string {
  return res.locals.browserOwnerId as string;
}

router.get("/browser/status", requireBrowserOwner, async (req, res): Promise<void> => {
  if (process.env.BROWSER_LOCAL_MODE === "true") {
    const connected = await isVncServerAvailable();
    res.json(
      GetBrowserStatusResponse.parse({
        deviceConnected: connected,
        browserOpen: connected,
        currentUrl: null,
        pageTitle: connected ? "Local Chromium desktop" : null,
      }),
    );
    return;
  }
  res.json(GetBrowserStatusResponse.parse(getBrowserStatus(ownerId(res))));
});

router.post("/browser/pairing", requireBrowserOwner, (req, res): void => {
  req.log.info("Creating remote browser pairing code.");
  res.json(CreateBrowserPairingResponse.parse(createPairing(ownerId(res))));
});

router.post(
  "/browser/viewer-ticket",
  requireBrowserOwner,
  (req, res): void => {
    res.json(
      CreateBrowserViewerTicketResponse.parse(createViewerTicket(ownerId(res))),
    );
  },
);

router.delete("/browser/session", requireBrowserOwner, (_req, res): void => {
  closeLocalVncViewer(ownerId(res));
  stopBrowserSession(ownerId(res));
  res.sendStatus(204);
});

export default router;
