import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import browserRouter from "./browser";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(browserRouter);

export default router;
