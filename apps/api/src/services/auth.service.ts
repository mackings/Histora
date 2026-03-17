import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import type { LoginInput, SignUpInput } from "../shared/index.js";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";
import { UserModel } from "../models/user.model.js";

export async function registerUser(payload: SignUpInput) {
  const existing = await UserModel.findOne({
    $or: [{ email: payload.email }, { username: payload.username }]
  });

  if (existing) {
    throw new AppError("Email or username already exists", 409);
  }

  const passwordHash = await bcrypt.hash(payload.password, 12);

  const user = await UserModel.create({
    fullName: payload.fullName,
    username: payload.username,
    email: payload.email,
    passwordHash
  });

  return issueAuthResponse(user.id);
}

export async function loginUser(payload: LoginInput) {
  const user = await UserModel.findOne({ email: payload.email });

  if (!user) {
    throw new AppError("Invalid credentials", 401);
  }

  const isValidPassword = await bcrypt.compare(payload.password, user.passwordHash);

  if (!isValidPassword) {
    throw new AppError("Invalid credentials", 401);
  }

  return issueAuthResponse(user.id);
}

export function issueAuthResponse(userId: string) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "7d" });

  return {
    token,
    userId
  };
}
