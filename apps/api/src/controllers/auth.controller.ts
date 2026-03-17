import { loginSchema, signUpSchema } from "../shared/index.js";

import { asyncHandler } from "../utils/async-handler.js";
import { loginUser, registerUser } from "../services/auth.service.js";


export const registerController = asyncHandler(async (request, response) => {
  const result = await registerUser(signUpSchema.parse(request.body));
  response.status(201).json(result);
});



export const loginController = asyncHandler(async (request, response) => {
  const result = await loginUser(loginSchema.parse(request.body));
  response.status(200).json(result);
});


