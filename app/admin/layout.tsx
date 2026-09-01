"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminHeaderBar from "@/components/admin-HeaderBar";
import SideHeaderBar from "@/components/admin-sidebar";
import { ToastContainer } from "react-toastify";
import { canAccessAdminPath, getAdminLandingPath } from "@/utils/adminAccess";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/admin/login";
  const [checking, setChecking] = useState(!isLoginPage);
  const [admin, setAdmin] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      if (isLoginPage) {
        setChecking(false);
        return;
      }

      setChecking(true);

      try {
        const res = await fetch("/api/v1/admin/auth/me", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success || !data.admin) {
          throw new Error(data?.message || "Unauthorized");
        }

        const currentAdmin = data.admin;
        if (!cancelled) {
          setAdmin(currentAdmin);

          if (!canAccessAdminPath(pathname, currentAdmin.role)) {
            router.replace(getAdminLandingPath(currentAdmin.role));
            return;
          }
        }
      } catch {
        if (!cancelled) {
          setAdmin(null);
          router.replace("/admin/login");
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [isLoginPage, pathname, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
        <div className="flex flex-col items-center justify-center">
          {/* Loading Card */}
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl px-10 py-8 flex flex-col items-center border border-white">
            {/* Animated Spinner */}
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin"></div>

              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-blue-600 rounded-full animate-pulse"></div>
              </div>
            </div>
            <p className="text-lg text-gray-500">Checking Access</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <AdminHeaderBar onToggleSidebar={undefined} admin={admin} />

      <div className="flex flex-1 overflow-hidden">
        <SideHeaderBar adminRole={admin?.role || ""} />

        <main className="flex-1 overflow-y-auto bg-gray-50">{children}</main>
      </div>

      <ToastContainer position="top-right" autoClose={2500} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover draggable theme="light" />
    </div>
  );
}
