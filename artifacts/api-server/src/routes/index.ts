import { Router, type IRouter } from "express";
import healthRouter from "./health";
import buyersRouter from "./buyers";
import invoicesRouter from "./invoices";
import dashboardRouter from "./dashboard";
import draftRouter from "./draft";
import escalationRouter from "./escalation";
import odrRouter from "./odr";

const router: IRouter = Router();

router.use(healthRouter);
router.use(buyersRouter);
router.use(invoicesRouter);
router.use(dashboardRouter);
router.use(draftRouter);
router.use(escalationRouter);
router.use(odrRouter);

export default router;
