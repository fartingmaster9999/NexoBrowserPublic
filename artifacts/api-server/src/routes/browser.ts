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

const router: IRouter = Router();

function ownerId(res: Response): string {
  return res.locals.browserOwnerId as string;
}

router.get("/browser/status", requireBrowserOwner, (req, res): void => {
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
  stopBrowserSession(ownerId(res));
  res.sendStatus(204);
});

export default router;
