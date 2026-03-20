import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import {
  ApiRequestError,
  type AuthSession,
  apiRequest,
  type VerificationResponse
} from "../../lib/api-client";
import { getErrorMessage, getStoredDeviceIdentity } from "../../lib/browser-client";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";

export function AuthPage({
  mode,
  onAuthenticated,
  IconComponent,
  SectionLabelComponent
}: {
  mode: "signin" | "signup" | "forgot" | "reset" | "verify" | "device";
  onAuthenticated: (session: AuthSession) => void;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const isSignin = mode === "signin";
  const isVerify = mode === "verify";
  const isDevice = mode === "device";
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const redirectAfterAuth = searchParams.get("redirect");
  const emailFromUrl = searchParams.get("email") ?? "";
  const challengeIdFromUrl = searchParams.get("challengeId") ?? "";
  const deviceNameFromUrl = searchParams.get("deviceName") ?? "";
  const authEyebrow = isSignup
    ? "OPEN_YOUR_ARCHIVE"
    : isForgot
      ? "RECOVER_ACCESS"
      : isReset
        ? "RESET_ENTRY"
        : isVerify
          ? "VERIFY_ADDRESS"
          : isDevice
            ? "APPROVE_DEVICE"
            : "RETURN_TO_RECORD";
  const authHeadline = isSignup
    ? "Begin your archive."
    : isForgot
      ? "Recover access."
      : isReset
        ? "Choose a new password."
        : isVerify
          ? "Verify your email."
          : isDevice
            ? "Approve this device."
            : "Welcome back.";
  const authIntro = isSignup
    ? "Build a private record first. Publish only when the story is ready."
    : isForgot
      ? "Request a reset code and get back to your drafts."
      : isReset
        ? "Set a stronger password and reopen your archive."
        : isVerify
          ? "Enter the 5-digit code we sent to unlock sign in."
          : isDevice
            ? "A new device needs approval before it can sign in. If alerts are active on another trusted browser, we notified it too."
            : "Sign in to continue writing, reading, and managing your archive.";
  const deviceIdentity = getStoredDeviceIdentity();
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
    verificationCode: "",
    resetCode: "",
    newPassword: "",
    confirmPassword: "",
    dateOfBirth: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formFeedback, setFormFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({
    password: false,
    newPassword: false,
    confirmPassword: false
  });
  const [deviceChallengeId, setDeviceChallengeId] = useState(challengeIdFromUrl);
  const [pendingDeviceName, setPendingDeviceName] = useState(deviceNameFromUrl || deviceIdentity.deviceName);

  useEffect(() => {
    if (emailFromUrl && !form.email) {
      setForm((current) => ({ ...current, email: emailFromUrl }));
    }
  }, [emailFromUrl, form.email]);

  useEffect(() => {
    if (challengeIdFromUrl) {
      setDeviceChallengeId(challengeIdFromUrl);
    }
    if (deviceNameFromUrl) {
      setPendingDeviceName(deviceNameFromUrl);
    }
  }, [challengeIdFromUrl, deviceNameFromUrl]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const togglePasswordVisibility = (field: keyof typeof visiblePasswords) => {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field]
    }));
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    const trimmedEmail = form.email.trim();

    if (isSignin || isSignup || isForgot || isVerify || isDevice) {
      if (!trimmedEmail) {
        nextErrors.email = "Email is required.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        nextErrors.email = "Enter a valid email address.";
      }
    }

    if (isSignin || isSignup) {
      if (!form.password) {
        nextErrors.password = "Password is required.";
      } else if (form.password.length < 10) {
        nextErrors.password = "Password must be at least 10 characters.";
      }
    }

    if (isSignup) {
      if (!form.fullName.trim()) {
        nextErrors.fullName = "Full name is required.";
      }

      if (!form.username.trim()) {
        nextErrors.username = "Username is required.";
      } else if (!/^@?[a-z0-9_]{3,20}$/i.test(form.username.trim())) {
        nextErrors.username = "Use 3-20 letters, numbers, or underscores.";
      }

      if (!form.dateOfBirth) {
        nextErrors.dateOfBirth = "Date of birth is required.";
      } else {
        const birthDate = new Date(form.dateOfBirth);
        const now = new Date();
        let age = now.getFullYear() - birthDate.getFullYear();
        const monthDiff = now.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
          age -= 1;
        }
        if (Number.isNaN(birthDate.getTime()) || age < 13) {
          nextErrors.dateOfBirth = "You must be at least 13 years old.";
        }
      }
    }

    if (isReset) {
      if (!form.resetCode.trim()) {
        nextErrors.resetCode = "Reset code is required.";
      } else if (form.resetCode.trim().length < 4) {
        nextErrors.resetCode = "Reset code looks too short.";
      }

      if (!form.newPassword) {
        nextErrors.newPassword = "New password is required.";
      } else if (form.newPassword.length < 10) {
        nextErrors.newPassword = "New password must be at least 10 characters.";
      }

      if (!form.confirmPassword) {
        nextErrors.confirmPassword = "Confirm your new password.";
      } else if (form.confirmPassword !== form.newPassword) {
        nextErrors.confirmPassword = "Passwords do not match.";
      }
    }

    if (isVerify || isDevice) {
      if (!/^\d{5}$/.test(form.verificationCode.trim())) {
        nextErrors.verificationCode = "Enter the 5-digit code.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleResendVerification = async () => {
    if (!form.email.trim()) {
      setErrors((current) => ({ ...current, email: "Email is required." }));
      setFormFeedback("Enter your email to request a new code.");
      return;
    }

    setIsSubmitting(true);
    setFormFeedback("");

    try {
      await apiRequest<VerificationResponse>("/auth/resend-verification", {
        method: "POST",
        body: {
          email: form.email.trim()
        }
      });
      setFormFeedback(`A new verification code was sent to ${form.email.trim().toLowerCase()}.`);
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not send a new verification code."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendDeviceCode = async () => {
    setIsSubmitting(true);
    setFormFeedback("");

    try {
      const payload = await apiRequest<{ ok: boolean; challengeId?: string; deviceName?: string }>("/auth/resend-device-verification", {
        method: "POST",
        body: {
          email: form.email.trim(),
          deviceId: deviceIdentity.deviceId,
          deviceName: pendingDeviceName
        }
      });
      if (payload.challengeId) {
        setDeviceChallengeId(payload.challengeId);
      }
      setFormFeedback(`A new device code was sent to ${form.email.trim().toLowerCase()}.`);
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not send another device code."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (!validateForm()) {
      setFormFeedback("Please fix the highlighted fields.");
      return;
    }

    setIsSubmitting(true);
    setFormFeedback("");

    try {
      if (isSignin) {
        try {
          const session = await apiRequest<AuthSession>("/auth/login", {
            method: "POST",
            body: {
              email: form.email.trim(),
              password: form.password,
              deviceId: deviceIdentity.deviceId,
              deviceName: deviceIdentity.deviceName
            }
          });
          onAuthenticated(session);
          setFormFeedback("Sign-in complete. Redirecting...");
          navigate(redirectAfterAuth || "/feed");
          return;
        } catch (error) {
          if (error instanceof ApiRequestError && error.code === "EMAIL_NOT_VERIFIED") {
            navigate(`/verify-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`);
            return;
          }
          if (error instanceof ApiRequestError && error.code === "DEVICE_VERIFICATION_REQUIRED") {
            const nextChallengeId = typeof error.details?.challengeId === "string" ? error.details.challengeId : "";
            const nextDeviceName: string = typeof error.details?.deviceName === "string" ? error.details.deviceName : deviceIdentity.deviceName;
            setDeviceChallengeId(nextChallengeId);
            setPendingDeviceName(nextDeviceName);
            navigate(
              `/verify-device?email=${encodeURIComponent(form.email.trim().toLowerCase())}&challengeId=${encodeURIComponent(nextChallengeId)}&deviceName=${encodeURIComponent(nextDeviceName)}`
            );
            return;
          }
          throw error;
        }
      }

      if (isSignup) {
        const result = await apiRequest<VerificationResponse>("/auth/register", {
          method: "POST",
          body: {
            fullName: form.fullName.trim(),
            username: form.username.trim().replace(/^@/, "").toLowerCase(),
            email: form.email.trim(),
            password: form.password,
            dateOfBirth: form.dateOfBirth
          }
        });
        setFormFeedback("Account created. Enter the code we sent to your email.");
        navigate(`/verify-email?email=${encodeURIComponent(result.email)}`);
        return;
      }

      if (isVerify) {
        await apiRequest<{ ok: boolean; email: string }>("/auth/verify-email", {
          method: "POST",
          body: {
            email: form.email.trim(),
            otp: form.verificationCode.trim()
          }
        });
        setFormFeedback("Email verified. Redirecting to sign in...");
        navigate(`/signin?email=${encodeURIComponent(form.email.trim().toLowerCase())}`);
        return;
      }

      if (isDevice) {
        const session = await apiRequest<AuthSession>("/auth/verify-device", {
          method: "POST",
          body: {
            challengeId: deviceChallengeId,
            email: form.email.trim(),
            otp: form.verificationCode.trim(),
            deviceId: deviceIdentity.deviceId,
            deviceName: pendingDeviceName
          }
        });
        onAuthenticated(session);
        setFormFeedback("Device approved. Redirecting...");
        navigate(redirectAfterAuth || "/feed");
        return;
      }

      if (isForgot) {
        const result = await apiRequest<{ ok: boolean; resetCode?: string }>("/auth/forgot-password", {
          method: "POST",
          body: {
            email: form.email.trim()
          }
        });
        setFormFeedback(
          result.resetCode
            ? `Reset code generated: ${result.resetCode}`
            : `If an account exists for ${form.email.trim()}, reset instructions have been prepared.`
        );
        return;
      }

      if (isReset) {
        await apiRequest<{ ok: boolean }>("/auth/reset-password", {
          method: "POST",
          body: {
            code: form.resetCode.trim(),
            password: form.newPassword
          }
        });
        setFormFeedback("Password updated. Redirecting to sign in...");
        navigate("/signin");
      }
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Authentication request failed."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page-shell auth-shell">
      <section className="auth-layout">
        <article className="auth-info card">
          <div className="auth-copy-stack">
            <SectionLabelComponent>{authEyebrow}</SectionLabelComponent>
            <h1>{authHeadline}</h1>
            <p>{authIntro}</p>
          </div>

          <div className="auth-story-panel">
            <div className="auth-pattern-band" aria-hidden="true">
              <span className="auth-pattern-mark" />
              <span className="auth-pattern-mark" />
              <span className="auth-pattern-mark" />
            </div>
            <p className="auth-motto">From oral memory to written archive.</p>
            <div className="auth-feature-list auth-heritage-grid">
              <div className="auth-feature-row auth-heritage-card">
                <strong>Griots and lineages</strong>
                <span>Hold names, moments, migrations, and family memory in one place.</span>
              </div>
              <div className="auth-feature-row auth-heritage-card">
                <strong>Bronze, cloth, manuscript</strong>
                <span>Write with the patience of preserved craft, not the noise of the feed.</span>
              </div>
              <div className="auth-feature-row auth-heritage-card">
                <strong>Private before public</strong>
                <span>Keep drafts protected, then decide what becomes part of the public record.</span>
              </div>
            </div>
          </div>
        </article>

        <article className="auth-card card">
          <div className="auth-card-head">
            <SectionLabelComponent>{isSignup ? "ACCOUNT_SETUP" : isForgot ? "EMAIL_RECOVERY" : isReset ? "PASSWORD_RESET" : isVerify ? "EMAIL_VERIFICATION" : "SIGN_IN"}</SectionLabelComponent>
            <h2>{isSignup ? "Create account" : isForgot ? "Forgot password" : isReset ? "Reset password" : isVerify ? "Verify email" : "Sign in"}</h2>
          </div>
          <form className="auth-form">
            {isSignup ? (
              <label className="auth-field">
                <span>Full name</span>
                <input onChange={(event) => updateField("fullName", event.target.value)} placeholder="Full name" value={form.fullName} />
                {errors.fullName ? <small className="form-error">{errors.fullName}</small> : null}
              </label>
            ) : null}
            {isSignup ? (
              <label className="auth-field">
                <span>Username</span>
                <input onChange={(event) => updateField("username", event.target.value)} placeholder="@username" value={form.username} />
                {errors.username ? <small className="form-error">{errors.username}</small> : null}
              </label>
            ) : null}
            {isSignin || isSignup || isForgot || isVerify || isDevice ? (
              <label className="auth-field">
                <span>Email address</span>
                <input onChange={(event) => updateField("email", event.target.value)} placeholder="Email address" type="email" value={form.email} />
                {errors.email ? <small className="form-error">{errors.email}</small> : null}
              </label>
            ) : null}
            {isVerify || isDevice ? (
              <label className="auth-field">
                <span>{isDevice ? "Device code" : "Verification code"}</span>
                <div className="auth-otp-row" role="group" aria-label="Verification code">
                  {Array.from({ length: 5 }, (_, index) => {
                    const currentValue = form.verificationCode[index] ?? "";
                    return (
                      <input
                        key={`otp-${index}`}
                        className="auth-otp-input"
                        inputMode="numeric"
                        maxLength={1}
                        onChange={(event) => {
                          const nextValue = event.target.value.replace(/\D/g, "").slice(-1);
                          const nextCode = Array.from({ length: 5 }, (_, otpIndex) =>
                            otpIndex === index ? nextValue : form.verificationCode[otpIndex] ?? ""
                          ).join("");
                          updateField("verificationCode", nextCode);
                          if (nextValue && event.currentTarget.nextElementSibling instanceof HTMLInputElement) {
                            event.currentTarget.nextElementSibling.focus();
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Backspace" && !currentValue && event.currentTarget.previousElementSibling instanceof HTMLInputElement) {
                            event.currentTarget.previousElementSibling.focus();
                          }
                        }}
                        onPaste={(event) => {
                          const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 5);
                          if (!pasted) {
                            return;
                          }
                          event.preventDefault();
                          updateField("verificationCode", pasted);
                        }}
                        value={currentValue}
                      />
                    );
                  })}
                </div>
                {errors.verificationCode ? <small className="form-error">{errors.verificationCode}</small> : null}
              </label>
            ) : null}
            {isSignin || isSignup ? (
              <label className="auth-field">
                <span>Password</span>
                <div className="auth-password-field">
                  <input
                    onChange={(event) => updateField("password", event.target.value)}
                    placeholder="Password"
                    type={visiblePasswords.password ? "text" : "password"}
                    value={form.password}
                  />
                  <button
                    aria-label={visiblePasswords.password ? "Hide password" : "Show password"}
                    className="auth-visibility-toggle"
                    onClick={() => togglePasswordVisibility("password")}
                    type="button"
                  >
                    <IconComponent className="inline-icon" name={visiblePasswords.password ? "eyeOff" : "eye"} />
                  </button>
                </div>
                {errors.password ? <small className="form-error">{errors.password}</small> : null}
              </label>
            ) : null}
            {isReset ? (
              <label className="auth-field">
                <span>Reset code</span>
                <input onChange={(event) => updateField("resetCode", event.target.value)} placeholder="Reset code" value={form.resetCode} />
                {errors.resetCode ? <small className="form-error">{errors.resetCode}</small> : null}
              </label>
            ) : null}
            {isReset ? (
              <label className="auth-field">
                <span>New password</span>
                <div className="auth-password-field">
                  <input
                    onChange={(event) => updateField("newPassword", event.target.value)}
                    placeholder="New password"
                    type={visiblePasswords.newPassword ? "text" : "password"}
                    value={form.newPassword}
                  />
                  <button
                    aria-label={visiblePasswords.newPassword ? "Hide new password" : "Show new password"}
                    className="auth-visibility-toggle"
                    onClick={() => togglePasswordVisibility("newPassword")}
                    type="button"
                  >
                    <IconComponent className="inline-icon" name={visiblePasswords.newPassword ? "eyeOff" : "eye"} />
                  </button>
                </div>
                {errors.newPassword ? <small className="form-error">{errors.newPassword}</small> : null}
              </label>
            ) : null}
            {isReset ? (
              <label className="auth-field">
                <span>Confirm new password</span>
                <div className="auth-password-field">
                  <input
                    onChange={(event) => updateField("confirmPassword", event.target.value)}
                    placeholder="Confirm new password"
                    type={visiblePasswords.confirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                  />
                  <button
                    aria-label={visiblePasswords.confirmPassword ? "Hide confirm password" : "Show confirm password"}
                    className="auth-visibility-toggle"
                    onClick={() => togglePasswordVisibility("confirmPassword")}
                    type="button"
                  >
                    <IconComponent className="inline-icon" name={visiblePasswords.confirmPassword ? "eyeOff" : "eye"} />
                  </button>
                </div>
                {errors.confirmPassword ? <small className="form-error">{errors.confirmPassword}</small> : null}
              </label>
            ) : null}
            {isSignup ? (
              <label className="auth-field">
                <span>Date of birth</span>
                <input onChange={(event) => updateField("dateOfBirth", event.target.value)} type="date" value={form.dateOfBirth} />
                {errors.dateOfBirth ? <small className="form-error">{errors.dateOfBirth}</small> : null}
              </label>
            ) : null}
            {isSignup ? (
              <label className="toggle-row auth-toggle-row">
                <input defaultChecked type="checkbox" />
                <span>Allow comments on published chapters by default</span>
              </label>
            ) : null}
            {formFeedback ? <p className="auth-feedback">{formFeedback}</p> : null}
            <button className="primary-action block-action" disabled={isSubmitting} onClick={() => void handlePrimaryAction()} type="button">
              {isSubmitting
                ? "PROCESSING..."
                : isSignup
                  ? "CREATE ACCOUNT"
                  : isDevice
                    ? "APPROVE DEVICE"
                    : isVerify
                      ? "VERIFY EMAIL"
                      : isForgot
                        ? "SEND RESET LINK"
                        : isReset
                          ? "UPDATE PASSWORD"
                          : "SIGN IN"}
              <IconComponent className="button-icon" name="arrow" />
            </button>
          </form>

          <div className="auth-support-links">
            {isSignin ? <NavLink to="/forgot-password">Forgot password?</NavLink> : null}
            {isSignup ? <NavLink to="/signin">Already have an account? Sign in</NavLink> : null}
            {isForgot ? <NavLink to="/reset-password">Already have a code? Reset password</NavLink> : null}
            {isReset ? <NavLink to="/signin">Back to sign in</NavLink> : null}
            {isVerify ? <button className="auth-inline-action" disabled={isSubmitting} onClick={() => void handleResendVerification()} type="button">Request another code</button> : null}
            {isVerify ? <NavLink to="/signin">Back to sign in</NavLink> : null}
            {isDevice ? <button className="auth-inline-action" disabled={isSubmitting} onClick={() => void handleResendDeviceCode()} type="button">Request another device code</button> : null}
            {isDevice ? <NavLink to="/signin">Back to sign in</NavLink> : null}
          </div>
          <div className="auth-note card">
            <strong>{isSignin ? "Protected access" : isVerify ? "Verification required" : isDevice ? "Trusted device required" : "Archive settings"}</strong>
            <span>
              {isSignin
                ? "Your session restores drafts, saved stories, and archive controls."
                : isVerify
                  ? "You can create an account first and verify later, but sign in stays locked until verification is complete."
                  : isDevice
                    ? `Only trusted devices can open your archive. Approve ${pendingDeviceName} to continue.`
                    : "Your account controls visibility, defaults, and archive ownership."}
            </span>
          </div>
        </article>
      </section>
    </main>
  );
}
