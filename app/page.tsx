"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import GargDental from "./dashboard/GargDental";

export default function HomePage() {
  const [showSplash, setShowSplash] = useState(true);
  const [offerImage, setOfferImage] = useState(null);
  const splashDurationMs = 6000;

  useEffect(() => {
    const splashShown = sessionStorage.getItem("splashShown");

    if (splashShown) {
      setShowSplash(false);
    }

    fetch("/api/v1/offers")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.offers?.length > 0) {
          setOfferImage(data.offers[0].offer_image_full_url);
        }
      })
      .catch((err) => console.error(err));

    if (!splashShown) {
      const timer = setTimeout(() => {
        setShowSplash(false);
        sessionStorage.setItem("splashShown", "true");
      }, splashDurationMs);

      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <>
      <main className="p-6">
        <GargDental />
      </main>

      {showSplash && offerImage && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65">
          <div className="relative rounded-2xl bg-transparent p-2 mx-4 sm:mx-8 md:mx-0">
            <button
              onClick={() => {
                sessionStorage.setItem("splashShown", "true");
                setShowSplash(false);
              }}
              className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black text-lg text-white transition hover:scale-110"
              aria-label="Close"
            >
              ✕
            </button>

            <Image src={offerImage} alt="Dental Nepal Offer" width={1300} height={950} priority className="rounded-xl max-w-[92vw] sm:max-w-full h-auto" />
          </div>
        </div>
      )}
    </>
  );
}
