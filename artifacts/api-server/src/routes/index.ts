import { Router, type IRouter } from "express";
import healthRouter from "./health";
import buyersRouter from "./buyers";
import invoicesRouter from "./invoices";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(buyersRouter);
router.use(invoicesRouter);
router.use(dashboardRouter);

export default router;
