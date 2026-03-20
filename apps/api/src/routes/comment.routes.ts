import { Router } from "express";

import { createCommentController, listCommentsController } from "../controllers/comment.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const commentRouter = Router();

commentRouter.get("/", listCommentsController);
commentRouter.post("/", requireAuth, createCommentController);

export { commentRouter };
