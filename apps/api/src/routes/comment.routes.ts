import { Router } from "express";

import { createCommentController, listCommentsController } from "../controllers/comment.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware.js";

const commentRouter = Router();

commentRouter.get("/", optionalAuth, listCommentsController);
commentRouter.post("/", requireAuth, createCommentController);

export { commentRouter };
