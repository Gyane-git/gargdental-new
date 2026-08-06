"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Mail, Send, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";

const EMPTY_FORM = {
  host: "",
  port: "465",
  username: "",
  password: "",
  encryption: "ssl",
  from_name: "",
  from_address: "",
};

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {children}
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </div>
  );
}

const inputCls =
  "w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white";

export default function EmailSettingsPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [hasSavedSettings, setHasSavedSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/v1/admin/email-settings", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to load email settings.");

        if (cancelled) return;

        if (data.settings) {
          setForm({
            host: data.settings.host || "",
            port: String(data.settings.port || "465"),
            username: data.settings.username || "",
            password: data.settings.password || "",
            encryption: data.settings.encryption || "ssl",
            from_name: data.settings.from_name || "",
            from_address: data.settings.from_address || "",
          });
          setHasSavedSettings(true);
        }
      } catch (err) {
        toast.error(err.message || "Failed to load email settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.host.trim()) return toast.error("SMTP host is required.");
    if (!form.username.trim()) return toast.error("SMTP username is required.");
    if (!hasSavedSettings && (!form.password || form.password === "********")) {
      return toast.error("SMTP password is required.");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v1/admin/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to save email settings.");

      toast.success(data.message || "Email settings saved successfully.");
      if (data.settings) {
        setForm((f) => ({ ...f, password: data.settings.password || f.password }));
        setHasSavedSettings(true);
      }
    } catch (err) {
      toast.error(err.message || "Failed to save email settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) return toast.error("Enter a recipient email for the test.");
    if (!form.host.trim() || !form.username.trim()) return toast.error("Fill in SMTP host and username first.");

    setTesting(true);
    try {
      const res = await fetch("/api/v1/admin/email-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, to: testEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to send test email.");

      toast.success(data.message || "Test email sent successfully.");
    } catch (err) {
      toast.error(err.message || "Failed to send test email.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="flex-1 p-3 sm:p-6">
        {/* Breadcrumb */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-normal text-gray-900">Email Configuration</h1>
          <p className="flex items-center gap-1 text-sm text-gray-500 mt-1">
            <LayoutDashboard size={14} />
            <Link href="/admin/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span>/</span>
            <span>Email Configuration</span>
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm w-full max-w-3xl px-6 sm:px-10 py-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Mail size={18} className="text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-blue-900">SMTP Settings</h2>
          </div>
          <p className="text-sm text-gray-400 mb-7">
            Configure the mail server used to send order confirmations, password resets, and other notifications. These
            settings override the server&apos;s .env values immediately, application-wide.
          </p>

          {loading ? (
            <p className="text-center text-sm text-gray-400 py-10">Loading...</p>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                <Field label="SMTP Host" hint="e.g. smtp.gmail.com">
                  <input type="text" value={form.host} onChange={set("host")} placeholder="smtp.gmail.com" className={inputCls} />
                </Field>

                <Field label="SMTP Port" hint="465 for SSL, 587 for TLS">
                  <input type="number" value={form.port} onChange={set("port")} placeholder="465" className={inputCls} />
                </Field>

                <Field label="Username" hint="Usually the full email address">
                  <input type="text" value={form.username} onChange={set("username")} placeholder="you@example.com" className={inputCls} />
                </Field>

                <Field label="Password" hint={hasSavedSettings ? "Leave as-is to keep the saved password" : "Required"}>
                  <input
                    type="password"
                    value={form.password}
                    onChange={set("password")}
                    placeholder={hasSavedSettings ? "********" : "Enter password"}
                    className={inputCls}
                  />
                </Field>

                <Field label="Encryption">
                  <select value={form.encryption} onChange={set("encryption")} className={`${inputCls} cursor-pointer`}>
                    <option value="ssl">SSL</option>
                    <option value="tls">TLS</option>
                    <option value="none">None</option>
                  </select>
                </Field>

                <Field label="Sender Name" hint="Shown as the 'From' name on outgoing emails">
                  <input type="text" value={form.from_name} onChange={set("from_name")} placeholder="Garg Dental" className={inputCls} />
                </Field>

                <Field label="Sender Email" hint="Defaults to Username if left blank">
                  <input type="email" value={form.from_address} onChange={set("from_address")} placeholder="noreply@example.com" className={inputCls} />
                </Field>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold rounded-lg transition disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Test Email */}
        {!loading && (
          <div className="bg-white rounded-xl shadow-sm w-full max-w-3xl px-6 sm:px-10 py-8 mt-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Send size={18} className="text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-blue-900">Send Test Email</h2>
            </div>
            <p className="text-sm text-gray-400 mb-5">
              Verify the settings above work before saving them - this uses whatever is currently filled in the form, not
              the saved configuration.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Send test email to..."
                className={`${inputCls} sm:flex-1`}
              />
              <button
                type="button"
                onClick={handleSendTest}
                disabled={testing}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {testing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Sending...
                  </>
                ) : (
                  "Send Test Email"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="py-5 text-center text-sm text-gray-500 border-t border-gray-200">
        Copyright &copy; 2026 <span className="font-bold text-gray-700">Global Tech Nepal Pvt. Ltd.</span>
      </footer>
    </div>
  );
}
