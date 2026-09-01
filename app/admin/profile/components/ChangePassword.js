"use client";

import { useState } from "react";

export default function ChangePassword({ onSubmit, saving = false }) {
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    renewPassword: "",
  });

  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));

    setErrors((prev) => ({
      ...prev,
      [e.target.name]: "",
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let validation = {};

    if (!formData.currentPassword.trim()) {
      validation.currentPassword = "Current password is required.";
    }

    if (!formData.newPassword.trim()) {
      validation.newPassword = "New password is required.";
    }

    if (!formData.renewPassword.trim()) {
      validation.renewPassword = "Please confirm your password.";
    }

    if (formData.newPassword && formData.renewPassword && formData.newPassword !== formData.renewPassword) {
      validation.renewPassword = "Passwords do not match.";
    }

    if (Object.keys(validation).length) {
      setErrors(validation);
      return;
    }

    await onSubmit?.(formData);

    setFormData({
      currentPassword: "",
      newPassword: "",
      renewPassword: "",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      {/* Current Password */}
      <div className="grid grid-cols-12 gap-5 items-center">
        <label className="col-span-12 md:col-span-4 font-semibold text-gray-700">Current Password</label>

        <div className="col-span-12 md:col-span-8">
          <input type="password" name="currentPassword" value={formData.currentPassword} onChange={handleChange} className="w-full rounded-md border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none" />

          {errors.currentPassword && <p className="mt-1 text-sm text-red-500">{errors.currentPassword}</p>}
        </div>
      </div>

      {/* New Password */}
      <div className="grid grid-cols-12 gap-5 items-center">
        <label className="col-span-12 md:col-span-4 font-semibold text-gray-700">New Password</label>

        <div className="col-span-12 md:col-span-8">
          <input type="password" name="newPassword" value={formData.newPassword} onChange={handleChange} className="w-full rounded-md border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none" />

          {errors.newPassword && <p className="mt-1 text-sm text-red-500">{errors.newPassword}</p>}
        </div>
      </div>

      {/* Confirm Password */}
      <div className="grid grid-cols-12 gap-5 items-center">
        <label className="col-span-12 md:col-span-4 font-semibold text-gray-700">Re-enter New Password</label>

        <div className="col-span-12 md:col-span-8">
          <input type="password" name="renewPassword" value={formData.renewPassword} onChange={handleChange} className="w-full rounded-md border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none" />

          {errors.renewPassword && <p className="mt-1 text-sm text-red-500">{errors.renewPassword}</p>}
        </div>
      </div>

      {/* Button */}
      <div className="flex justify-center pt-2">
        <button
          type="submit"
          disabled={saving}
          className={`rounded-md px-8 py-2.5 font-medium text-white transition-all duration-200 flex items-center justify-center gap-2
    ${saving ? "bg-[#5264f3] cursor-not-allowed opacity-90" : "bg-[#4154f1] hover:bg-[#3145e5] hover:shadow-lg hover:shadow-indigo-200 active:scale-[0.98]"}`}
        >
          {saving ? (
            <>
              {/* Spinner */}
              <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />

                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>

              <span>Updating...</span>
            </>
          ) : (
            <>
              <span>Change Password</span>
              <span className="text-lg">→</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
