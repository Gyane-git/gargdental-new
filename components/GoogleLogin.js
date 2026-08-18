"use client";

import { useEffect } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { getFullInfo } from "@/utils/apiHelper";
import { toast } from "react-hot-toast";
import useWarningModalStore from "@/stores/warningModalStore";
import useCartStore from "@/stores/useCartStore";

const GoogleLoginButton = () => {
  const { setUserProfile } = useCartStore();
  const router = useRouter();

  const handleCredentialResponse = async (response) => {
    try {
      const idToken = response.credential;

      if (!idToken) {
        throw new Error("Google credential was not received.");
      }

      // Decode Google ID token payload to get Google's unique user ID.
      // The token is a JWT: header.payload.signature
      const base64Payload = idToken.split(".")[1];

      if (!base64Payload) {
        throw new Error("Invalid Google ID token.");
      }

      const payload = JSON.parse(
        decodeURIComponent(
          atob(base64Payload.replace(/-/g, "+").replace(/_/g, "/"))
            .split("")
            .map(
              (char) =>
                "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2),
            )
            .join(""),
        ),
      );

      const uniqueId = payload.sub;

      if (!uniqueId) {
        throw new Error("Google user ID was not found.");
      }

      console.log("Google user ID:", uniqueId);
      console.log("Google email:", payload.email);

      // Send the fields required by /google-register
      const res = await fetch("/api/google-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: idToken,
          unique_id: uniqueId,
          access_token: "0",
        }),
      });

      const data = await res.json();

      console.log("Google authentication response:", data);

      if (!res.ok || !data.success) {
        useWarningModalStore.getState().open({
          title: "Error",
          message:
            data?.errors?.[0]?.message ||
            data?.error ||
            data?.message ||
            "Google login failed.",
        });

        return;
      }

      if (data.token) {
        await fetch("/api/auth/set-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: data.token,
          }),
        });

        const result = await getFullInfo();

        setUserProfile(result.data);

        toast.success("Login successful!");
      }

      router.push("/dashboard");
    } catch (error) {
      console.error("Google login error:", error);

      useWarningModalStore.getState().open({
        title: "Error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to login with Google.",
      });
    }
  };

  useEffect(() => {
    const initializeGoogle = () => {
      if (
        window.google &&
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID &&
        document.getElementById("google-button")
      ) {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });

        const button = document.getElementById("google-button");

        if (button) {
          button.innerHTML = "";

          window.google.accounts.id.renderButton(button, {
            theme: "outline",
            size: "large",
            text: "continue_with",
          });
        }

        return true;
      }

      return false;
    };

    if (initializeGoogle()) {
      return;
    }

    const interval = setInterval(() => {
      if (initializeGoogle()) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          console.log("Google Identity Services loaded.");
        }}
      />

      <div id="google-button"></div>
    </>
  );
};

export default GoogleLoginButton;
